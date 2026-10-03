local lvgl = require("lvgl")

local SOURCE_ROOTS = {
  "/data/quickapp/files/icu.ccicc.jslab/fonts",
  "/data/files/icu.ccicc.jslab/fonts",
}
local TARGET_ROOTS = {
  "/data/quickapp/app/icu.ccicc.jslab/common/fonts",
  "/data/app/icu.ccicc.jslab/common/fonts",
}
local SOURCE_FONT = ""
local SOURCE_DATA = ""
local SOURCE_STATE = ""
local SOURCE_PARTS = ""
local SOURCE_FIRST_PART = ""
local DECODED_FONT = ""
local INSTALL_REQUEST = ""
local INSTALL_RESULT = ""
local HEARTBEAT = ""
local TARGET_FONT = ""
local TARGET_DATA = ""
local TARGET_DIRECTORY = ""
local TARGET_FONT_NEW = ""
local TARGET_DATA_NEW = ""
local TARGET_FONT_BACKUP = ""
local TARGET_DATA_BACKUP = ""
local update_progress = function() end

local function read_file(path)
  if not io or not io.open then return nil end
  local handle = io.open(path, "rb")
  if not handle then return nil end
  local value = handle:read("*a")
  handle:close()
  return value
end

local function file_exists(path)
  if not io or not io.open then return false end
  local handle = io.open(path, "rb")
  if not handle then return false end
  handle:close()
  return true
end

local function use_target_root(root)
  TARGET_DIRECTORY = root
  TARGET_FONT = root .. "/active.ttf"
  TARGET_DATA = root .. "/active.json"
  TARGET_FONT_NEW = TARGET_FONT .. ".new"
  TARGET_DATA_NEW = TARGET_DATA .. ".new"
  TARGET_FONT_BACKUP = TARGET_FONT .. ".backup"
  TARGET_DATA_BACKUP = TARGET_DATA .. ".backup"
end

local function use_source_root(root)
  SOURCE_FONT = root .. "/pending.ttf"
  SOURCE_DATA = root .. "/pending.json"
  SOURCE_STATE = root .. "/pending.state.json"
  SOURCE_PARTS = root .. "/pending.parts"
  SOURCE_FIRST_PART = SOURCE_PARTS .. "/part-000000.b64"
  DECODED_FONT = root .. "/pending.decoded.ttf"
  INSTALL_REQUEST = root .. "/install.request.json"
  INSTALL_RESULT = root .. "/install.result.json"
  HEARTBEAT = root .. "/helper.heartbeat.json"
end

local function write_heartbeat()
  if not io or not io.open or not os or not os.time or HEARTBEAT == "" then return false end
  local handle = io.open(HEARTBEAT, "wb")
  if not handle then return false end
  local content = '{"version":1,"type":"jslab_helper_heartbeat","updatedAt":' .. tostring(os.time()) .. '}'
  local written = handle:write(content)
  handle:close()
  return written ~= nil
end

local function locate_pending_package()
  for index, root in ipairs(SOURCE_ROOTS) do
    use_source_root(root)
    use_target_root(TARGET_ROOTS[index])
    if file_exists(INSTALL_REQUEST) or file_exists(SOURCE_DATA) or file_exists(SOURCE_FONT) or file_exists(SOURCE_FIRST_PART) then
      return true
    end
  end
  use_source_root(SOURCE_ROOTS[1])
  use_target_root(TARGET_ROOTS[1])
  return false
end

local function json_string(data, key, fallback)
  if not data then return fallback end
  return data:match('"' .. key .. '"%s*:%s*"([^\"]*)"') or fallback
end

local function json_number(data, key, fallback)
  if not data then return fallback end
  return data:match('"' .. key .. '"%s*:%s*([%-%.%d]+)') or fallback
end

local function json_escape(value)
  value = tostring(value or "")
  value = value:gsub("\\", "\\\\")
  value = value:gsub('"', '\\"')
  value = value:gsub("\n", "\\n")
  value = value:gsub("\r", "\\r")
  return value
end

local function command_succeeded(result)
  return result == true or result == 0
end

local function shell_succeeded(command)
  if not os or not os.execute then return false end
  return command_succeeded(os.execute(command))
end

local function adler32_file(path)
  if not io or not io.open then return nil end
  local handle = io.open(path, "rb")
  if not handle then return nil end
  local a, b = 1, 0
  while true do
    local chunk = handle:read(4096)
    if not chunk then break end
    for index = 1, #chunk do
      a = (a + chunk:byte(index)) % 65521
      b = (b + a) % 65521
    end
  end
  handle:close()
  return string.format("%08x", b * 65536 + a)
end

local function valid_font_header(path)
  if not io or not io.open then return false end
  local handle = io.open(path, "rb")
  if not handle then return false end
  local header = handle:read(4)
  handle:close()
  return header == "\0\1\0\0" or header == "OTTO" or
    header == "true" or header == "typ1" or header == "ttcf"
end

local function file_size(path)
  if not io or not io.open then return nil end
  local handle = io.open(path, "rb")
  if not handle then return nil end
  local size = handle:seek("end")
  handle:close()
  return size
end

local function copy_file(source, destination)
  if not io or not io.open then return false end
  local input = io.open(source, "rb")
  if not input then return false end
  local output = io.open(destination, "wb")
  if not output then
    input:close()
    return false
  end
  while true do
    local chunk = input:read(4096)
    if not chunk then break end
    if not output:write(chunk) then
      input:close()
      output:close()
      return false
    end
  end
  input:close()
  output:close()
  return true
end

local function rename_file(source, destination)
  return os and os.rename and os.rename(source, destination) == true
end

local function remove_file(path)
  if os and os.remove then os.remove(path) end
end

local function write_install_result(request_id, status, message, source_name, checksum)
  if not io or not io.open then return false end
  local temporary = INSTALL_RESULT .. ".new"
  local handle = io.open(temporary, "wb")
  if not handle then return false end
  local content = '{"version":1,"type":"font_install_result","id":"' .. json_escape(request_id) ..
    '","status":"' .. json_escape(status) .. '","message":"' .. json_escape(message) ..
    '","sourceName":"' .. json_escape(source_name) .. '","checksum":"' .. json_escape(checksum) .. '"}'
  local written = handle:write(content)
  handle:close()
  if not written then
    remove_file(temporary)
    return false
  end
  remove_file(INSTALL_RESULT)
  if rename_file(temporary, INSTALL_RESULT) then return true end
  if not copy_file(temporary, INSTALL_RESULT) then return false end
  remove_file(temporary)
  return true
end

local function restore_active_package(had_font, had_data)
  remove_file(TARGET_FONT)
  remove_file(TARGET_DATA)
  local font_restored = not had_font or rename_file(TARGET_FONT_BACKUP, TARGET_FONT)
  local data_restored = not had_data or rename_file(TARGET_DATA_BACKUP, TARGET_DATA)
  return font_restored and data_restored
end

local function recover_interrupted_install()
  local font_backup = file_exists(TARGET_FONT_BACKUP)
  local data_backup = file_exists(TARGET_DATA_BACKUP)
  if not font_backup and not data_backup then return true end
  if font_backup then
    remove_file(TARGET_FONT)
    if not rename_file(TARGET_FONT_BACKUP, TARGET_FONT) then return false end
  end
  if data_backup then
    remove_file(TARGET_DATA)
    if not rename_file(TARGET_DATA_BACKUP, TARGET_DATA) then return false end
  end
  return true
end

local function replace_active_package()
  local had_font = file_exists(TARGET_FONT)
  local had_data = file_exists(TARGET_DATA)
  if had_font and not rename_file(TARGET_FONT, TARGET_FONT_BACKUP) then
    return false
  end
  if had_data and not rename_file(TARGET_DATA, TARGET_DATA_BACKUP) then
    if had_font then rename_file(TARGET_FONT_BACKUP, TARGET_FONT) end
    return false
  end
  if not rename_file(TARGET_FONT_NEW, TARGET_FONT) or not rename_file(TARGET_DATA_NEW, TARGET_DATA) then
    restore_active_package(had_font, had_data)
    return false
  end
  remove_file(TARGET_FONT_BACKUP)
  remove_file(TARGET_DATA_BACKUP)
  return true
end

local function part_path(index)
  return string.format("%s/part-%06d.b64", SOURCE_PARTS, index)
end

local BASE64 = {}
do
  local alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  for index = 1, #alphabet do
    BASE64[alphabet:sub(index, index)] = index - 1
  end
end

local function decode_base64(value)
  if type(value) ~= "string" or #value == 0 or #value % 4 ~= 0 then return nil end
  local output = {}
  for index = 1, #value, 4 do
    local first = BASE64[value:sub(index, index)]
    local second = BASE64[value:sub(index + 1, index + 1)]
    local third_char = value:sub(index + 2, index + 2)
    local fourth_char = value:sub(index + 3, index + 3)
    local third = third_char == "=" and 0 or BASE64[third_char]
    local fourth = fourth_char == "=" and 0 or BASE64[fourth_char]
    if not first or not second or not third or not fourth or
        (third_char == "=" and fourth_char ~= "=") or
        ((third_char == "=" or fourth_char == "=") and index + 3 ~= #value) then
      return nil
    end
    output[#output + 1] = string.char(first * 4 + math.floor(second / 16))
    if third_char ~= "=" then
      output[#output + 1] = string.char((second % 16) * 16 + math.floor(third / 4))
    end
    if fourth_char ~= "=" then
      output[#output + 1] = string.char((third % 4) * 64 + fourth)
    end
  end
  return table.concat(output)
end

local function decode_parts(part_count)
  if not io or not io.open then return false end
  local output = io.open(DECODED_FONT, "wb")
  if not output then return false end
  for index = 0, part_count - 1 do
    local encoded = read_file(part_path(index))
    local decoded = decode_base64(encoded)
    if not decoded then
      output:close()
      shell_succeeded("rm -f " .. DECODED_FONT)
      return false
    end
    output:write(decoded)
    if index == part_count - 1 or index % 8 == 0 then
      update_progress(index + 1, part_count, "Decoding font")
    end
  end
  output:close()
  return true
end

local function remove_pending_parts(part_count)
  for index = 0, part_count - 1 do
    shell_succeeded("rm -f " .. part_path(index))
  end
end

local root = lvgl.Object(nil, {
  w = lvgl.HOR_RES(), h = lvgl.VER_RES(), bg_color = 0x2F2F2F, border_width = 0,
})
root:clear_flag(lvgl.FLAG.SCROLLABLE)

local CLOCK_HEIGHT = 96
local ANIMATION_SIZE = 260
local CONTENT_GAP = 14
local CONTENT_TOP = math.floor((lvgl.VER_RES() - CLOCK_HEIGHT - CONTENT_GAP - ANIMATION_SIZE) / 2)

local title = lvgl.Label(root, {
  x = 0, y = CONTENT_TOP, w = lvgl.HOR_RES(),
  text = os.date("%H:%M"), text_color = 0xE8EEF5,
  text_font = lvgl.Font("MiSans-Regular", 96),
  align = lvgl.ALIGN.TOP_MID,
})

local font_label = lvgl.Label(root, {
  text = "", text_color = 0x9FB3C8,
  text_font = lvgl.Font("montserrat", 16, "normal"),
  align = { type = lvgl.ALIGN.TOP_MID, y_ofs = 66 },
})

local data_label = lvgl.Label(root, {
  text = "", text_color = 0x6F8195,
  text_font = lvgl.Font("montserrat", 13, "normal"),
  align = { type = lvgl.ALIGN.TOP_MID, y_ofs = 98 },
})

local status_label = lvgl.Label(root, {
  text = "", text_color = 0xD2E8FF,
  text_font = lvgl.Font("montserrat", 14, "normal"),
  align = { type = lvgl.ALIGN.BOTTOM_MID, y_ofs = -22 },
})

local function watchface_root_from_script()
  if not debug or type(debug.getinfo) ~= "function" then return nil end
  local info = debug.getinfo(1, "S")
  local source = info and info.source or ""
  if source:sub(1, 1) == "@" then source = source:sub(2) end
  return source:match("^(.*)/lua/main%.lua$")
end

local WATCHFACE_ROOT = watchface_root_from_script()
local function animation_frame_path(frame)
  if not WATCHFACE_ROOT then return nil end
  return string.format(WATCHFACE_ROOT .. "/images/helper-animation-bin/frame-%02d.bin", frame)
end
local animated_icon = nil
local image_ready, image_result = pcall(function()
  -- Use an absolute NuttX path: the runtime resolves S:/ paths as QuickApp
  -- resources and cannot locate assets packaged by a market watchface.
  local image = root:Image({
    x = math.floor((lvgl.HOR_RES() - ANIMATION_SIZE) / 2),
    y = CONTENT_TOP + CLOCK_HEIGHT + CONTENT_GAP,
    w = ANIMATION_SIZE, h = ANIMATION_SIZE,
  })
  local first_frame = animation_frame_path(1)
  if not first_frame then error("cannot resolve watchface asset path") end
  image:set_src(first_frame)
  return image
end)
if image_ready then
  animated_icon = image_result
end

local progress_track = lvgl.Object(root, {
  w = 236, h = 10, radius = 5, bg_color = 0x202A36, border_width = 0,
  align = { type = lvgl.ALIGN.TOP_MID, y_ofs = 187 },
})
progress_track:clear_flag(lvgl.FLAG.SCROLLABLE)
local progress_fill = lvgl.Object(progress_track, {
  w = 0, h = 10, radius = 5, bg_color = 0x3A8DD6, border_width = 0,
  align = { type = lvgl.ALIGN.LEFT_MID, x_ofs = 0 },
})
progress_fill:clear_flag(lvgl.FLAG.SCROLLABLE)

font_label:add_flag(lvgl.FLAG.HIDDEN)
data_label:add_flag(lvgl.FLAG.HIDDEN)
progress_track:add_flag(lvgl.FLAG.HIDDEN)
status_label:add_flag(lvgl.FLAG.HIDDEN)

if not image_ready then
  status_label:clear_flag(lvgl.FLAG.HIDDEN)
  status_label:set({
    text = "Image error: " .. tostring(image_result):sub(1, 42),
    text_color = 0xFFC2C2,
  })
end

update_progress = function(current, total, stage)
  local safe_total = math.max(1, total or 1)
  local percent = math.max(0, math.min(100, math.floor((current or 0) * 100 / safe_total)))
  status_label:clear_flag(lvgl.FLAG.HIDDEN)
  status_label:set({ text = stage .. " " .. tostring(percent) .. "%", text_color = 0xD2E8FF })
end

local refresh_button = lvgl.Object(root, {
  w = 150, h = 44, radius = 14, bg_color = 0x1B2330,
  border_width = 1, border_color = 0x2A2F38,
  align = { type = lvgl.ALIGN.BOTTOM_MID, y_ofs = -48 },
})
refresh_button:clear_flag(lvgl.FLAG.SCROLLABLE)
refresh_button:add_flag(lvgl.FLAG.CLICKABLE)
local refresh_text = lvgl.Label(refresh_button, {
  text = "Refresh", text_color = 0xE8EEF5,
  text_font = lvgl.Font("montserrat", 16, "normal"), align = lvgl.ALIGN.CENTER,
})

local hint = lvgl.Label(root, {
  text = "", text_color = 0x9FB3C8,
  text_font = lvgl.Font("montserrat", 13, "normal"),
  align = { type = lvgl.ALIGN.BOTTOM_MID, y_ofs = -18 },
})

refresh_button:add_flag(lvgl.FLAG.HIDDEN)
hint:add_flag(lvgl.FLAG.HIDDEN)

local function refresh()
  locate_pending_package()
  if image_ready then
    status_label:add_flag(lvgl.FLAG.HIDDEN)
  end
end

local frame_index = 1
local function update_clock()
  title:set({ text = os.date("%H:%M") })
end

local clock_timer = lvgl.Timer({
  period = 1000, repeat_count = -1,
  cb = function() update_clock() end,
})
clock_timer:resume()

-- Keep a shared heartbeat so the quick app can tell whether this helper is alive
-- even while its watchface page is not visible.
locate_pending_package()
write_heartbeat()
local heartbeat_timer = lvgl.Timer({
  period = 5000, repeat_count = -1,
  cb = function() write_heartbeat() end,
})
heartbeat_timer:resume()

local animation_failed = false
local animation_timer = lvgl.Timer({
  period = 166, repeat_count = -1,
  cb = function()
    if not image_ready or not animated_icon then return end
    frame_index = frame_index % 16 + 1
    local updated, update_error = pcall(function()
      animated_icon:set_src(animation_frame_path(frame_index))
    end)
    if not updated then
      animation_failed = true
      animation_timer:pause()
      status_label:clear_flag(lvgl.FLAG.HIDDEN)
      status_label:set({
        text = "Animation error: " .. tostring(update_error):sub(1, 36),
        text_color = 0xFFC2C2,
      })
    end
  end,
})
animation_timer:resume()

function pageOnPause()
  clock_timer:pause()
  animation_timer:pause()
end

function pageOnResume()
  update_clock()
  clock_timer:resume()
  if image_ready and not animation_failed then
    animation_timer:resume()
  end
end

local function install_pending_package()
  locate_pending_package()
  local data = read_file(SOURCE_DATA)
  local parts_package = json_string(data, "storage", "") == "parts-base64-v2"
  local legacy_ready = not parts_package and file_exists(SOURCE_FONT)
  local parts_ready = file_exists(SOURCE_FIRST_PART)
  if (not legacy_ready and not parts_ready) or not data then
    return false, "字体包不完整，请重新上传"
  end

  local expected_size = tonumber(json_number(data, "size", "0")) or 0
  local part_count = tonumber(json_number(data, "partCount", "0")) or 0
  local chunk_bytes = tonumber(json_number(data, "chunkBytes", "0")) or 0
  local checksum_algorithm = json_string(data, "checksumAlgorithm", "")
  local expected_checksum = string.lower(json_string(data, "checksum", ""))
  local part_encoding = json_string(data, "partEncoding", "")
  if not legacy_ready and (expected_size < 1 or expected_size > 2097152) then
    return false, "字体包大小无效，请重新上传"
  end
  if not legacy_ready and (part_count < 1 or part_count > 1024 or chunk_bytes < 1 or chunk_bytes > 16384 or
      part_count ~= math.ceil(expected_size / chunk_bytes) or part_encoding ~= "base64" or checksum_algorithm ~= "adler32" or
      #expected_checksum ~= 8 or not expected_checksum:match("^%x+$")) then
    return false, "字体包校验资料无效，请重新上传"
  end

  update_progress(0, 100, "Preparing installation")
  local font_source = SOURCE_FONT
  if not legacy_ready then
    if not decode_parts(part_count) or file_size(DECODED_FONT) ~= expected_size then
      shell_succeeded("rm -f " .. DECODED_FONT)
      return false, "字体分片无效，请重新上传"
    end
    font_source = DECODED_FONT
  end

  update_progress(82, 100, "Copying font")
  if not (os and os.rename) then
    return false, "安装失败：表盘没有文件重命名权限"
  end
  if not recover_interrupted_install() then
    return false, "安装失败：无法恢复上一次字体"
  end
  if not file_exists(TARGET_FONT) and not file_exists(TARGET_DATA) and
      not shell_succeeded("mkdir -p " .. TARGET_DIRECTORY) then
    return false, "安装失败：无法创建目标目录"
  end
  remove_file(TARGET_FONT_NEW)
  remove_file(TARGET_DATA_NEW)
  remove_file(TARGET_FONT_BACKUP)
  remove_file(TARGET_DATA_BACKUP)
  if not copy_file(font_source, TARGET_FONT_NEW) or not copy_file(SOURCE_DATA, TARGET_DATA_NEW) then
    remove_file(TARGET_FONT_NEW)
    remove_file(TARGET_DATA_NEW)
    return false, "安装失败：无法准备字体文件"
  end
  update_progress(90, 100, "Verifying font")
  local checksum_ok = legacy_ready or adler32_file(TARGET_FONT_NEW) == expected_checksum
  if not valid_font_header(TARGET_FONT_NEW) or not checksum_ok then
    remove_file(TARGET_FONT_NEW)
    remove_file(TARGET_DATA_NEW)
    remove_file(DECODED_FONT)
    return false, "字体校验失败，请重新上传"
  end
  local moved = replace_active_package()
  if moved then
    update_progress(100, 100, "Installation complete")
    remove_file(SOURCE_FONT)
    remove_file(SOURCE_DATA)
    remove_file(SOURCE_STATE)
    remove_file(DECODED_FONT)
    if not legacy_ready then remove_pending_parts(part_count) end
  end
  if moved then
    return true, "字体已安装。请完全退出并重新打开 JSLab"
  else
    return false, "安装失败：缺少文件或 shell 权限"
  end
end

local function process_install_request()
  locate_pending_package()
  local request = read_file(INSTALL_REQUEST)
  if not request then return false end
  local request_id = json_string(request, "id", "")
  local request_version = tonumber(json_number(request, "version", "0")) or 0
  local request_type = json_string(request, "type", "")
  local action = json_string(request, "action", "")
  local request_algorithm = json_string(request, "checksumAlgorithm", "")
  local request_checksum = string.lower(json_string(request, "checksum", ""))
  local request_source = json_string(request, "sourceName", "")
  local request_size = tonumber(json_number(request, "size", "0")) or 0
  local data = read_file(SOURCE_DATA)
  local expected_checksum = string.lower(json_string(data, "checksum", ""))
  local source_name = json_string(data, "sourceName", "")
  local expected_size = tonumber(json_number(data, "size", "0")) or 0
  if not request_id:match("^[A-Za-z0-9_-]+$") or request_version ~= 1 or
      request_type ~= "font_install_request" or action ~= "install" or request_algorithm ~= "adler32" then
    write_install_result(request_id, "error", "安装请求无效", source_name, expected_checksum)
    remove_file(INSTALL_REQUEST)
    return true
  end
  if request_checksum ~= expected_checksum or request_source ~= source_name or request_size ~= expected_size then
    write_install_result(request_id, "error", "字体包已变更，请在 JSLab 重新发起安装", source_name, expected_checksum)
    remove_file(INSTALL_REQUEST)
    return true
  end
  status_label:clear_flag(lvgl.FLAG.HIDDEN)
  status_label:set({ text = "正在安装字体", text_color = 0xD2E8FF })
  local success, message = install_pending_package()
  write_install_result(request_id, success and "ok" or "error", message, source_name, expected_checksum)
  remove_file(INSTALL_REQUEST)
  status_label:clear_flag(lvgl.FLAG.HIDDEN)
  status_label:set({ text = message, text_color = success and 0x9FE5B0 or 0xFFC2C2 })
  return true
end

refresh()
process_install_request()
