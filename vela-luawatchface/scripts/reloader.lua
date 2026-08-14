-- 热重载器：推送脚本将此文件注入为设备上的 lua/main.lua
-- 用户代码被推送为 _app_main.lua，由此加载
local lvgl = require("lvgl")

local function get_this_dir()
  local src = ""
  if debug and debug.getinfo then
    local info = debug.getinfo(1, "S")
    src = (info and info.source) or ""
  end
  if type(src) ~= "string" then src = "" end
  if src:sub(1, 1) == "@" then src = src:sub(2) end
  src = src:gsub("\\", "/")
  return src:match("^(.*)/[^/]+$") or "."
end

local LUA_DIR = get_this_dir()
local DEST_ROOT = LUA_DIR:match("^(.*)/lua$") or (LUA_DIR .. "/..")
local STAMP_DIR = DEST_ROOT .. "/.hotreload"
local APP_MAIN = LUA_DIR .. "/_app_main.lua"

local MODE_ALIGN, MODE_TICK = 1, 2
local ALIGN_FAST, ALIGN_SLOW = 25, 200

local os_time = os.time
local pcall = pcall
local xpcall = xpcall
local tostring = tostring
local collectgarbage = collectgarbage

local orig_Timer = lvgl.Timer
local orig_Anim = lvgl.Anim
local fs_open_dir = lvgl.fs.open_dir

-- 跟踪用户代码创建的独立资源（不在 widget tree 上的）
local app_timers = {}
local app_anims = {}
local app_subscriptions = {}  -- {module, id_or_args} topic/dataman 订阅
local app_animengines = {}    -- animengine.create 返回的实例
local tracking = false

lvgl.Timer = function(...)
  local t = orig_Timer(...)
  if tracking and t then app_timers[#app_timers + 1] = t end
  return t
end

if orig_Anim then
  lvgl.Anim = function(...)
    local a = orig_Anim(...)
    if tracking and a then app_anims[#app_anims + 1] = a end
    return a
  end
end

-- 代理 topic.subscribe / dataman.subscribe
local topic = package.loaded.topic
local dataman = package.loaded.dataman
local animengine = package.loaded.animengine

local orig_topic_subscribe = topic and topic.subscribe
local orig_dataman_subscribe = dataman and dataman.subscribe
local orig_animengine_create = animengine and animengine.create

if orig_topic_subscribe then
  topic.subscribe = function(...)
    local ret = orig_topic_subscribe(...)
    if tracking then app_subscriptions[#app_subscriptions + 1] = { mod = topic, unsub = "unsubscribe", args = {...}, ret = ret } end
    return ret
  end
end

if orig_dataman_subscribe then
  dataman.subscribe = function(...)
    local ret = orig_dataman_subscribe(...)
    if tracking then app_subscriptions[#app_subscriptions + 1] = { mod = dataman, unsub = "unsubscribe", args = {...}, ret = ret } end
    return ret
  end
end

if orig_animengine_create then
  animengine.create = function(...)
    local e = orig_animengine_create(...)
    if tracking and e then app_animengines[#app_animengines + 1] = e end
    return e
  end
end

local function cleanup_resources()
  tracking = false

  local function try(desc, fn)
    local ok, err = pcall(fn)
    if not ok then log_error("cleanup " .. desc .. " failed: " .. tostring(err)) end
  end

  for i = #app_timers, 1, -1 do
    try("timer:pause", function() app_timers[i]:pause() end)
    try("timer:delete", function() app_timers[i]:delete() end)
    app_timers[i] = nil
  end
  for i = #app_anims, 1, -1 do
    try("anim:stop", function() app_anims[i]:stop() end)
    try("anim:delete", function() app_anims[i]:delete() end)
    app_anims[i] = nil
  end
  for i = #app_subscriptions, 1, -1 do
    local sub = app_subscriptions[i]
    try("unsubscribe", function()
      local unsub_fn = sub.mod[sub.unsub]
      if unsub_fn then
        if sub.ret ~= nil then
          unsub_fn(sub.ret)
        else
          unsub_fn(unpack(sub.args))
        end
      else
        error(sub.unsub .. " not found on module")
      end
    end)
    app_subscriptions[i] = nil
  end
  for i = #app_animengines, 1, -1 do
    try("animengine:stop", function() app_animengines[i]:stop() end)
    try("animengine:delete", function() app_animengines[i]:delete() end)
    app_animengines[i] = nil
  end
end

local function tb(err)
  local tr = (debug and debug.traceback and debug.traceback("", 2)) or ""
  return tostring(err) .. (tr ~= "" and ("\n" .. tr) or "")
end

local function log_error(msg)
  print("[hotreload] " .. tostring(msg))
end

-- 清理屏幕上所有子对象
local function clean_screen()
  local ok, scr = pcall(lvgl.scr_act)
  if ok and scr then
    pcall(function() scr:clean() end)
  end
end

local function load_app()
  if loadfile then
    local chunk, err = loadfile(APP_MAIN)
    if not chunk then
      error("load app failed: " .. tostring(err))
    end
    return chunk()
  end
  if dofile then
    local ok, res = pcall(dofile, APP_MAIN)
    if not ok then
      error("dofile app failed: " .. tostring(res))
    end
    return res
  end
  error("loadfile/dofile not available")
end

local function read_token(dir)
  local d = select(1, fs_open_dir(dir))
  if not d then return nil end
  local ok, name = pcall(function()
    local latest = nil
    while true do
      local n = d:read()
      if not n then break end
      if n ~= "." and n ~= ".." then
        if not latest or n > latest then
          latest = n
        end
      end
    end
    return latest
  end)
  pcall(function() d:close() end)
  return ok and name or nil
end

local APP_DEPS = {}

local RELOAD_BLOCKLIST = {
  lvgl = true, package = true, dataman = true, topic = true,
  activity = true, animengine = true, navigator = true, screen = true,
  vibrator = true, coroutine = true, debug = true, io = true,
  math = true, os = true, string = true, table = true, _G = true,
}

local function unload_deps(deps)
  for name, _ in pairs(deps) do
    if not RELOAD_BLOCKLIST[name] then
      package.loaded[name] = nil
      rawset(_G, name, nil)
    end
  end
end

local in_reload = false
local main_timer = nil

local function reload_app()
  in_reload = true
  if main_timer then pcall(function() main_timer:pause() end) end

  -- 清理旧 UI 和独立资源
  cleanup_resources()
  clean_screen()

  -- 卸载用户模块
  unload_deps(APP_DEPS)
  package.loaded.main = nil
  collectgarbage("collect")

  -- 跟踪依赖并加载用户代码（开启资源追踪）
  local recorded = {}
  local old_require = require
  _G.require = function(name)
    recorded[name] = true
    return old_require(name)
  end
  tracking = true

  local ok, err = xpcall(load_app, tb)
  -- require 包装保持生效，持续追踪运行时懒加载的模块

  if not ok then
    log_error("reload failed:\n" .. tostring(err))
    in_reload = false
    if main_timer then pcall(function() main_timer:resume() end) end
    return false
  end

  APP_DEPS = recorded
  in_reload = false
  if main_timer then pcall(function() main_timer:resume() end) end
  return true
end

reload_app()

local last_token, last_token_check_epoch = nil, -1
local function maybe_check_token(epoch)
  if epoch == last_token_check_epoch then return end
  last_token_check_epoch = epoch
  local token = read_token(STAMP_DIR)
  if token and token ~= last_token then
    if reload_app() then last_token = token end
  end
end

-- 主循环：对齐秒级并检查热更标记
local mode, current_period = MODE_ALIGN, 200
local last_epoch, ticks = os_time(), 0
local near_secs = { [58] = true, [59] = true, [0] = true }

main_timer = orig_Timer({
  period = current_period,
  cb = function(self)
    if in_reload then return end

    local epoch = os_time()

    if mode == MODE_ALIGN then
      if epoch ~= last_epoch then
        maybe_check_token(epoch)
        mode, ticks = MODE_TICK, 0
        current_period = 1000
        pcall(function() self:set({ period = 1000 }) end)
      else
        local s = epoch % 60
        local target = near_secs[s] and ALIGN_FAST or ALIGN_SLOW
        if target ~= current_period then
          current_period = target
          pcall(function() self:set({ period = target }) end)
        end
        maybe_check_token(epoch)
      end

    else
      maybe_check_token(epoch)

      ticks = ticks + 1
      if ticks >= 60 or (epoch % 60) == 0 then
        mode, ticks = MODE_ALIGN, 0
        if current_period ~= ALIGN_SLOW then
          current_period = ALIGN_SLOW
          pcall(function() self:set({ period = ALIGN_SLOW }) end)
        end
      end
    end

    last_epoch = epoch
  end
})
main_timer:resume()
