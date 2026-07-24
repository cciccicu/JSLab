use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use astrobox_ng_wit::astrobox::psys_host::device::{self, DeviceInfo};
use astrobox_ng_wit::astrobox::psys_host::dialog::{
    self, DialogButton, DialogInfo, DialogStyle, DialogType, FilterConfig, PickConfig,
};
use astrobox_ng_wit::astrobox::psys_host::interconnect;
use astrobox_ng_wit::astrobox::psys_host::register;
use astrobox_ng_wit::astrobox::psys_host::thirdpartyapp;
use astrobox_ng_wit::astrobox::psys_host::timer;
use astrobox_ng_wit::astrobox::psys_host::ui_v3::{
    self, Element, ElementType, Event, FlexDirection,
};
use astrobox_ng_wit::exports::astrobox::psys_plugin::event_v3::{EventType, Guest as EventGuest};
use astrobox_ng_wit::exports::astrobox::psys_plugin::lifecycle::Guest as LifecycleGuest;

const PACKAGE_NAME: &str = "icu.ccicc.jslab";
const MAX_SCRIPT_BYTES: usize = 48 * 1024;
const WRITE_CHUNK_BYTES: usize = 4096;
const DISCOVERY_RETRY_PREFIX: &str = "jslab-discovery:";
const DISCOVERY_RETRY_DELAY_MS: u64 = 2_000;
const MAX_DISCOVERY_ATTEMPTS: u32 = 15;
const CONNECT_TIMER_PREFIX: &str = "jslab-connect:";

struct Plugin;

enum Pending {
    Hello,
    List,
    FontConfig,
    FontConfigSet,
    Read {
        name: String,
        content: String,
    },
    WriteStart {
        name: String,
        content: String,
        success_message: String,
        update_editor_clean: bool,
    },
    WriteChunk {
        transfer_id: String,
        name: String,
        content: String,
        offset: usize,
        index: usize,
        success_message: String,
        update_editor_clean: bool,
    },
    WriteFinish {
        success_message: String,
        update_editor_clean: bool,
    },
    Mutation {
        success_message: String,
    },
}

#[derive(Clone)]
struct FontMetrics {
    line_height_ratio: f64,
    line_height_offset: f64,
    ascii_width_ratio: f64,
    wide_width_ratio: f64,
}

impl Default for FontMetrics {
    fn default() -> Self {
        Self {
            line_height_ratio: 1.0,
            line_height_offset: 0.0,
            ascii_width_ratio: 0.5,
            wide_width_ratio: 1.0,
        }
    }
}

struct AppState {
    element_id: Option<String>,
    devices: Vec<DeviceInfo>,
    selected_device: Option<String>,
    channel_ready: bool,
    files: Vec<FileMeta>,
    font_metrics: FontMetrics,
    selected_file: Option<String>,
    editor_name: String,
    editor_text: String,
    editor_original: String,
    editor_dirty: bool,
    status: String,
    error: Option<String>,
    busy: bool,
    request_sequence: u64,
    discovery_generation: u64,
    diagnostic_sequence: u64,
    pending: HashMap<String, Pending>,
    request_timers: HashMap<String, u64>,
}

#[derive(Clone, Default)]
struct FileMeta {
    name: String,
    size: usize,
}

#[derive(Clone)]
struct ViewState {
    devices: Vec<(String, String)>,
    selected_device: Option<String>,
    channel_ready: bool,
    files: Vec<FileMeta>,
    font_metrics: FontMetrics,
    selected_file: Option<String>,
    editor_name: String,
    editor_text: String,
    status: String,
    error: Option<String>,
    busy: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            element_id: None,
            devices: Vec::new(),
            selected_device: None,
            channel_ready: false,
            files: Vec::new(),
            font_metrics: FontMetrics::default(),
            selected_file: None,
            editor_name: String::new(),
            editor_text: String::new(),
            editor_original: String::new(),
            editor_dirty: false,
            status: "正在发现设备".into(),
            error: None,
            busy: false,
            request_sequence: 0,
            discovery_generation: 0,
            diagnostic_sequence: 0,
            pending: HashMap::new(),
            request_timers: HashMap::new(),
        }
    }
}

static STATE: OnceLock<Mutex<AppState>> = OnceLock::new();

fn state() -> &'static Mutex<AppState> {
    STATE.get_or_init(|| Mutex::new(AppState::default()))
}

fn with_state<T>(operation: impl FnOnce(&mut AppState) -> T) -> T {
    let mut guard = state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    operation(&mut guard)
}

fn snapshot() -> ViewState {
    with_state(|state| ViewState {
        devices: state
            .devices
            .iter()
            .map(|d| (d.name.clone(), d.addr.clone()))
            .collect(),
        selected_device: state.selected_device.clone(),
        channel_ready: state.channel_ready,
        files: state.files.clone(),
        font_metrics: state.font_metrics.clone(),
        selected_file: state.selected_file.clone(),
        editor_name: state.editor_name.clone(),
        editor_text: state.editor_text.clone(),
        status: state.status.clone(),
        error: state.error.clone(),
        busy: state.busy,
    })
}

fn diagnostic(message: impl Into<String>) {
    let message = message.into();
    let line = with_state(|state| {
        state.diagnostic_sequence = state.diagnostic_sequence.wrapping_add(1);
        format!("#{:04} {}", state.diagnostic_sequence, message)
    });
    println!("[JSLab Sync] {line}");
}

fn set_error(message: impl Into<String>) {
    let message = message.into();
    diagnostic(format!("ERROR {message}"));
    with_state(|state| {
        state.error = Some(message);
        state.status = "操作失败".into();
        state.channel_ready = false;
        state.busy = false;
        state.pending.clear();
    });
    render_current();
}

fn set_status(message: impl Into<String>, busy: bool) {
    let message = message.into();
    diagnostic(format!("STATUS busy={busy} {message}"));
    with_state(|state| {
        state.status = message;
        state.error = None;
        state.busy = busy;
    });
    render_current();
}

fn render_current() {
    let id = with_state(|state| state.element_id.clone());
    if let Some(id) = id {
        render(&id);
    }
}

fn label(text: impl Into<String>, color: &str, size: u32) -> Element {
    let text = text.into();
    Element::new(ElementType::P, Some(&text))
        .text_color(color)
        .size(size)
}

fn button(
    text: impl Into<String>,
    event_id: impl Into<String>,
    primary: bool,
    disabled: bool,
) -> Element {
    let text = text.into();
    let event_id = event_id.into();
    let button = Element::new(ElementType::Button, Some(&text))
        .padding(10)
        .radius(6)
        .bg(if primary { "#1677FF" } else { "#252A33" })
        .text_color("#FFFFFF")
        .on(Event::Click, &event_id);
    if disabled { button.disabled() } else { button }
}

fn render(element_id: &str) {
    let view = snapshot();
    let device_online = view.selected_device.is_some();
    let connected = view.channel_ready;
    let editor_open = view.selected_file.is_some();

    let status_badge = Element::new(
        ElementType::Badge,
        Some(if connected {
            "已连接".into()
        } else if device_online {
            "设备在线".into()
        } else {
            "未连接".into()
        }),
    )
    .padding(6)
    .radius(6)
    .bg(if connected {
        "#173A2C"
    } else if device_online {
        "#3D341C"
    } else {
        "#44262A"
    })
    .text_color(if connected {
        "#75E0B2"
    } else if device_online {
        "#FFD77A"
    } else {
        "#FF9A9A"
    });

    let header = Element::new(ElementType::Div, None)
        .flex()
        .flex_direction(FlexDirection::Row)
        .align_center()
        .gap(10)
        .child(label("JSLab 文件同步", "#F5F7FA", 22))
        .child(status_badge)
        .child(button("刷新设备", "device-refresh", false, view.busy));

    let status_row = Element::new(ElementType::Div, None)
        .flex()
        .flex_direction(FlexDirection::Row)
        .align_center()
        .gap(8)
        .child(label("状态", "#7F8998", 13))
        .child(label(view.status.clone(), "#C8CED8", 14));

    let mut device_row = Element::new(ElementType::Div, None)
        .flex()
        .flex_direction(FlexDirection::Row)
        .align_center()
        .gap(8)
        .child(label("设备", "#7F8998", 13));
    if view.devices.is_empty() {
        device_row = device_row.child(label("AstroBox 当前没有已连接设备", "#FFB3B3", 14));
    } else {
        for (index, (name, addr)) in view.devices.iter().enumerate() {
            let active = view.selected_device.as_deref() == Some(addr.as_str());
            device_row = device_row.child(button(
                if active {
                    format!("{} · 当前", name)
                } else {
                    name.clone()
                },
                format!("device-select:{index}"),
                active,
                view.busy,
            ));
        }
    }

    let mut root = Element::new(ElementType::Div, None)
        .flex()
        .flex_direction(FlexDirection::Column)
        .width_full()
        .min_height(560)
        .padding(16)
        .gap(10)
        .bg("#0B0D10")
        .text_color("#F5F7FA")
        .child(header)
        .child(status_row)
        .child(device_row)
        .child(
            Element::new(ElementType::Separator, None)
                .width_full()
                .height(1)
                .bg("#252A33"),
        );

    if let Some(error) = view.error {
        root = root.child(
            Element::new(ElementType::Div, Some(&error))
                .padding(10)
                .margin_bottom(10)
                .radius(4)
                .bg("#451E24")
                .text_color("#FFC2C2"),
        );
    }

    let metrics = &view.font_metrics;
    let font_panel = Element::new(ElementType::Div, None)
        .flex()
        .flex_direction(FlexDirection::Column)
        .gap(8)
        .padding(10)
        .radius(6)
        .bg("#111419")
        .child(label("编辑器字体 · Ubuntu Mono", "#DCE2EA", 17))
        .child(label(
            format!(
                "行高 {:.3}x  偏移 {:.1}px  ASCII {:.3}x  宽字符 {:.3}x",
                metrics.line_height_ratio,
                metrics.line_height_offset,
                metrics.ascii_width_ratio,
                metrics.wide_width_ratio
            ),
            "#AEB8C6",
            13,
        ))
        .child(
            Element::new(ElementType::Div, None)
                .flex()
                .flex_direction(FlexDirection::Row)
                .gap(6)
                .child(button("行高", "font-line-height", false, view.busy || !connected))
                .child(button("偏移", "font-line-offset", false, view.busy || !connected))
                .child(button("ASCII", "font-ascii-width", false, view.busy || !connected))
                .child(button("宽字符", "font-wide-width", false, view.busy || !connected))
                .child(button("重置", "font-reset", false, view.busy || !connected)),
        );
    root = root.child(font_panel);

    if !editor_open {
        let list_toolbar = Element::new(ElementType::Div, None)
            .flex()
            .flex_direction(FlexDirection::Row)
            .align_center()
            .gap(8)
            .child(label(
                format!("手环文件 · {}", view.files.len()),
                "#DCE2EA",
                17,
            ))
            .child(button("新建", "file-new", true, view.busy || !connected))
            .child(button(
                "上传",
                "file-upload",
                false,
                view.busy || !connected,
            ))
            .child(button(
                "刷新",
                "files-refresh",
                false,
                view.busy || !connected,
            ));
        let mut file_list = Element::new(ElementType::ScrollArea, None)
            .flex()
            .flex_direction(FlexDirection::Column)
            .gap(8)
            .width_full()
            .height(480);
        if view.files.is_empty() {
            file_list = file_list
                .child(label("暂无 JavaScript 文件", "#C8CED8", 18))
                .child(label(
                    "可新建空白脚本，或从电脑上传 .js 文件",
                    "#7F8998",
                    14,
                ));
        } else {
            for (index, file) in view.files.iter().enumerate() {
                file_list = file_list.child(
                    button(
                        format!("{}    {}", file.name, format_size(file.size)),
                        format!("file-select:{index}"),
                        false,
                        view.busy,
                    )
                    .width_full(),
                );
            }
        }
        root = root.child(list_toolbar).child(file_list);
    } else {
        let file_name = view
            .selected_file
            .clone()
            .unwrap_or_else(|| "正在载入".into());
        let editor_title = file_name;
        let editor_toolbar = Element::new(ElementType::Div, None)
            .flex()
            .flex_direction(FlexDirection::Row)
            .align_center()
            .gap(8)
            .child(button("返回列表", "editor-close", false, view.busy))
            .child(label(editor_title, "#DCE2EA", 17))
            .child(button("重命名", "file-rename", false, view.busy))
            .child(button("下载", "file-download", false, view.busy))
            .child(button("删除", "file-delete", false, view.busy));
        let editor = Element::new(ElementType::Textarea, Some(&view.editor_text))
            .prop("placeholder", "正在从手环读取文件…")
            .prop("spellcheck", "false")
            .width_full()
            .height(460)
            .padding(12)
            .radius(6)
            .bg("#111419")
            .text_color("#F3F5F7")
            .border(1, "#343B46")
            .on(Event::Input, "editor-input");
        root = root.child(editor_toolbar).child(editor).child(
            button(
                "保存到手环",
                "editor-save",
                true,
                view.busy || !connected || view.editor_name.is_empty(),
            )
            .width_full(),
        );
    }
    ui_v3::render(element_id, root);
}

fn format_size(bytes: usize) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else {
        format!("{:.1} KiB", bytes as f64 / 1024.0)
    }
}

fn valid_script_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name.to_ascii_lowercase().ends_with(".js")
        && !name.contains("..")
        && !name
            .chars()
            .any(|c| c.is_control() || c == '/' || c == '\\')
}

fn next_utf8_chunk(content: &str, offset: usize) -> (&str, usize) {
    if offset >= content.len() {
        return ("", content.len());
    }
    let mut end = usize::min(offset + WRITE_CHUNK_BYTES, content.len());
    while end > offset && !content.is_char_boundary(end) {
        end -= 1;
    }
    (&content[offset..end], end)
}

fn input_value(payload: &str) -> String {
    let Ok(value) = serde_json::from_str::<Value>(payload) else {
        return payload.to_string();
    };
    fn find(value: &Value) -> Option<&str> {
        match value {
            Value::String(value) => Some(value),
            Value::Object(map) => ["value", "text", "content"]
                .iter()
                .find_map(|key| map.get(*key).and_then(Value::as_str))
                .or_else(|| {
                    ["detail", "target", "currentTarget", "event"]
                        .iter()
                        .find_map(|key| map.get(*key).and_then(find))
                }),
            _ => None,
        }
    }
    find(&value).unwrap_or_default().to_string()
}

fn decode_hex_utf8(value: &str) -> Result<String, String> {
    if value.len() % 2 != 0 {
        return Err("Interconnect payloadHex 长度无效".into());
    }
    let bytes = (0..value.len())
        .step_by(2)
        .map(|index| {
            u8::from_str_radix(&value[index..index + 2], 16)
                .map_err(|_| "Interconnect payloadHex 内容无效".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    String::from_utf8(bytes).map_err(|_| "Interconnect payloadHex 不是 UTF-8 文本".into())
}

fn decode_interconnect_response(
    payload: &str,
) -> Result<(Value, Option<String>, Option<String>), String> {
    let outer: Value =
        serde_json::from_str(payload).map_err(|_| "收到无法解析的 JSLab 回包".to_string())?;
    let envelope_addr = outer
        .get("addr")
        .and_then(Value::as_str)
        .map(str::to_string);
    let envelope_package = ["pkgName", "packageName", "package"]
        .iter()
        .find_map(|key| outer.get(key).and_then(Value::as_str))
        .map(str::to_string);

    let mut current = outer;
    for _ in 0..4 {
        if current.get("v").is_some() && current.get("type").is_some() {
            return Ok((current, envelope_addr, envelope_package));
        }
        if let Some(text) = current.as_str() {
            current = serde_json::from_str(text)
                .map_err(|_| "收到无法解析的 JSLab 回包正文".to_string())?;
            continue;
        }
        if let Some(nested) = ["payloadText", "payload", "data"]
            .iter()
            .find_map(|key| current.get(key).filter(|value| !value.is_null()))
        {
            current = nested.clone();
            continue;
        }
        if let Some(hex) = current.get("payloadHex").and_then(Value::as_str) {
            current = Value::String(decode_hex_utf8(hex)?);
            continue;
        }
        break;
    }
    Err("Interconnect 信封中没有可用的 JSLab 回包正文".into())
}

async fn start_device_refresh() -> Result<(), String> {
    let generation = with_state(|state| {
        state.discovery_generation = state.discovery_generation.wrapping_add(1);
        state.discovery_generation
    });
    diagnostic(format!("DISCOVERY start generation={generation}"));
    refresh_devices(generation, 1).await
}

async fn refresh_devices(generation: u64, attempt: u32) -> Result<(), String> {
    let current = with_state(|state| state.discovery_generation == generation);
    if !current {
        diagnostic(format!(
            "DISCOVERY ignore stale generation={generation} attempt={attempt}"
        ));
        return Ok(());
    }
    set_status("正在发现设备", true);
    let devices = device::get_connected_device_list().await;
    diagnostic(format!(
        "DISCOVERY result generation={generation} attempt={attempt} devices={}",
        devices.len()
    ));
    let selected = with_state(|state| {
        let previous = state.selected_device.clone();
        state.devices = devices;
        state.selected_device = previous
            .filter(|addr| state.devices.iter().any(|d| &d.addr == addr))
            .or_else(|| state.devices.first().map(|d| d.addr.clone()));
        state.channel_ready = false;
        state.selected_device.clone()
    });

    let Some(addr) = selected else {
        with_state(|state| {
            state.files.clear();
            state.selected_file = None;
            state.status = if attempt < MAX_DISCOVERY_ATTEMPTS {
                format!("等待 AstroBox 完成设备连接 · {attempt}/{MAX_DISCOVERY_ATTEMPTS}")
            } else {
                "未发现已连接设备，请确认 AstroBox 主界面显示已连接".into()
            };
            state.error = None;
            state.busy = false;
        });
        render_current();
        if attempt < MAX_DISCOVERY_ATTEMPTS {
            let payload = format!("{DISCOVERY_RETRY_PREFIX}{generation}:{}", attempt + 1);
            let timer_id = timer::set_timeout(DISCOVERY_RETRY_DELAY_MS, &payload).await;
            diagnostic(format!(
                "TIMER armed id={timer_id} delay_ms={DISCOVERY_RETRY_DELAY_MS} payload={payload}"
            ));
        }
        return Ok(());
    };

    launch_jslab(&addr).await
}

async fn select_device(index: usize) -> Result<(), String> {
    let addr = with_state(|state| {
        state.devices.get(index).map(|device| {
            state.selected_device = Some(device.addr.clone());
            state.channel_ready = false;
            state.files.clear();
            state.selected_file = None;
            device.addr.clone()
        })
    })
    .ok_or_else(|| "设备已离线，请刷新设备".to_string())?;
    launch_jslab(&addr).await
}

async fn launch_jslab(addr: &str) -> Result<(), String> {
    set_status("正在检查设备上的 JSLab", true);
    diagnostic(format!("APP_LIST request addr={addr}"));
    let apps = match thirdpartyapp::get_thirdparty_app_list(addr).await {
        Ok(apps) => apps,
        Err(()) => {
            diagnostic(format!("APP_LIST failed addr={addr}"));
            return Err("无法读取设备快应用列表，请检查 thirdpartyapp 权限".into());
        }
    };
    diagnostic(format!("APP_LIST result addr={addr} count={}", apps.len()));
    let app = apps
        .iter()
        .find(|app| app.package_name == PACKAGE_NAME)
        .ok_or_else(|| "设备上未安装 JSLab 1.4.0 或更高版本".to_string())?;
    if app.version_code < 140 {
        return Err(format!(
            "手环端 JSLab 版本过旧（versionCode={}），请安装 1.4.0 或更高版本",
            app.version_code
        ));
    }
    diagnostic(format!(
        "APP matched package={} version_code={} fingerprint_words={}",
        app.package_name,
        app.version_code,
        app.fingerprint.len()
    ));

    diagnostic(format!(
        "LAUNCH request addr={addr} package={PACKAGE_NAME} page=/"
    ));
    if thirdpartyapp::launch_qa(addr, app, "/").await.is_err() {
        diagnostic(format!("LAUNCH failed addr={addr}"));
        return Err("无法在设备上启动 JSLab".into());
    }
    diagnostic(format!("LAUNCH success addr={addr} package={PACKAGE_NAME}"));
    set_status("JSLab 已启动，正在等待同步通道", true);
    let payload = format!("{CONNECT_TIMER_PREFIX}{addr}");
    let timer_id = timer::set_timeout(2_000, &payload).await;
    diagnostic(format!(
        "TIMER armed id={timer_id} delay_ms=2000 payload={payload}"
    ));
    render_current();
    Ok(())
}

async fn connect_interconnect(addr: &str) -> Result<(), String> {
    let still_selected = with_state(|state| state.selected_device.as_deref() == Some(addr));
    if !still_selected {
        diagnostic(format!("CONNECT ignored stale addr={addr}"));
        return Ok(());
    }
    diagnostic(format!(
        "REGISTER request addr={addr} package={PACKAGE_NAME}"
    ));
    if register::register_interconnect_recv(addr, PACKAGE_NAME)
        .await
        .is_err()
    {
        diagnostic(format!(
            "REGISTER failed addr={addr} package={PACKAGE_NAME}"
        ));
        return Err("无法注册 JSLab Interconnect 接收通道，请检查插件权限".into());
    }
    diagnostic(format!(
        "REGISTER success addr={addr} package={PACKAGE_NAME}"
    ));
    set_status("同步通道已注册，正在握手", true);
    send_request("hello", json!({}), Pending::Hello).await
}

async fn send_request(action: &str, payload: Value, pending: Pending) -> Result<(), String> {
    let (id, addr) = with_state(|state| {
        state.request_sequence += 1;
        let id = format!("p{}", state.request_sequence);
        state.pending.insert(id.clone(), pending);
        state.busy = true;
        state.error = None;
        (id, state.selected_device.clone())
    });
    let Some(addr) = addr else {
        with_state(|state| {
            state.pending.remove(&id);
        });
        return Err("没有已连接设备".into());
    };
    let timer_id = timer::set_timeout(15_000, &id).await;
    diagnostic(format!(
        "REQUEST timeout armed id={id} timer_id={timer_id} delay_ms=15000"
    ));
    with_state(|state| {
        if state.pending.contains_key(&id) {
            state.request_timers.insert(id.clone(), timer_id);
        }
    });
    render_current();
    let message = json!({
        "v": 1,
        "type": "request",
        "id": id,
        "action": action,
        "payload": payload,
    })
    .to_string();
    diagnostic(format!(
        "REQUEST send id={id} action={action} addr={addr} bytes={}",
        message.len()
    ));
    if interconnect::send_qaic_message(&addr, PACKAGE_NAME, &message)
        .await
        .is_err()
    {
        diagnostic(format!("REQUEST send failed id={id} action={action}"));
        let timer_id = with_state(|state| {
            state.pending.remove(&id);
            let timer_id = state.request_timers.remove(&id);
            state.busy = !state.pending.is_empty();
            timer_id
        });
        if let Some(timer_id) = timer_id {
            timer::clear_timer(timer_id).await;
        }
        return Err("消息发送失败，请确认 JSLab 已安装且设备在线".into());
    }
    diagnostic(format!("REQUEST send accepted id={id} action={action}"));
    Ok(())
}

async fn request_list() -> Result<(), String> {
    let already_pending = with_state(|state| {
        state
            .pending
            .values()
            .any(|pending| matches!(pending, Pending::List))
    });
    if already_pending {
        diagnostic("LIST refresh coalesced");
        return Ok(());
    }
    set_status("正在刷新文件列表", true);
    send_request("list", json!({}), Pending::List).await
}

async fn request_font_config() -> Result<(), String> {
    let already_pending = with_state(|state| {
        state.pending.values().any(|pending| matches!(pending, Pending::FontConfig))
    });
    if already_pending {
        return Ok(());
    }
    send_request("getEditorFontConfig", json!({}), Pending::FontConfig).await
}

async fn request_set_font_config(metrics: FontMetrics) -> Result<(), String> {
    set_status("正在保存编辑器度量", true);
    send_request(
        "setEditorFontConfig",
        json!({
            "profile": {
                "lineHeightRatio": metrics.line_height_ratio,
                "lineHeightOffset": metrics.line_height_offset,
                "asciiWidthRatio": metrics.ascii_width_ratio,
                "wideWidthRatio": metrics.wide_width_ratio,
            }
        }),
        Pending::FontConfigSet,
    ).await
}

fn parse_font_metrics(result: &Value) -> Result<FontMetrics, String> {
    let profile = result.get("profile").ok_or("字体配置回包缺少 profile")?;
    let value = |name: &str, fallback: f64| profile.get(name).and_then(Value::as_f64).unwrap_or(fallback);
    Ok(FontMetrics {
        line_height_ratio: value("lineHeightRatio", 1.0),
        line_height_offset: value("lineHeightOffset", 0.0),
        ascii_width_ratio: value("asciiWidthRatio", 0.5),
        wide_width_ratio: value("wideWidthRatio", 1.0),
    })
}

async fn request_read(name: String) -> Result<(), String> {
    set_status(format!("正在读取 {name}"), true);
    send_request(
        "read",
        json!({ "name": name, "offset": 0 }),
        Pending::Read {
            name,
            content: String::new(),
        },
    )
    .await
}

async fn request_write(
    name: String,
    content: String,
    success_message: String,
    overwrite: bool,
    update_editor_clean: bool,
) -> Result<(), String> {
    if !valid_script_name(&name) {
        return Err("文件名必须是不含路径的 .js 文件名".into());
    }
    if content.len() > MAX_SCRIPT_BYTES {
        return Err("脚本不能超过 48 KiB".into());
    }
    set_status(format!("正在准备写入 {name}"), true);
    send_request(
        "writeStart",
        json!({ "name": name, "size": content.len(), "overwrite": overwrite }),
        Pending::WriteStart {
            name,
            content,
            success_message,
            update_editor_clean,
        },
    )
    .await
}

async fn send_next_write_chunk(
    transfer_id: String,
    name: String,
    content: String,
    offset: usize,
    index: usize,
    success_message: String,
    update_editor_clean: bool,
) -> Result<(), String> {
    if offset >= content.len() {
        return send_request(
            "writeFinish",
            json!({ "transferId": transfer_id }),
            Pending::WriteFinish {
                success_message,
                update_editor_clean,
            },
        )
        .await;
    }
    let (chunk, next_offset) = next_utf8_chunk(&content, offset);
    set_status(
        format!(
            "正在写入 {} · {} / {}",
            name,
            format_size(next_offset),
            format_size(content.len())
        ),
        true,
    );
    send_request(
        "writeChunk",
        json!({ "transferId": transfer_id, "index": index, "content": chunk }),
        Pending::WriteChunk {
            transfer_id,
            name,
            content,
            offset: next_offset,
            index: index + 1,
            success_message,
            update_editor_clean,
        },
    )
    .await
}

async fn process_interconnect_message(payload: &str) -> Result<(), String> {
    diagnostic(format!(
        "RESPONSE received bytes={} preview={}",
        payload.len(),
        payload.chars().take(160).collect::<String>()
    ));
    let (response, envelope_addr, envelope_package) = decode_interconnect_response(payload)?;
    diagnostic(format!(
        "RESPONSE envelope addr={} package={} decoded_bytes={}",
        envelope_addr.as_deref().unwrap_or("<none>"),
        envelope_package.as_deref().unwrap_or("<none>"),
        response.to_string().len()
    ));
    if let Some(package) = envelope_package.as_deref() {
        if package != PACKAGE_NAME {
            return Err(format!("收到其他快应用的 Interconnect 回包：{package}"));
        }
    }
    if let Some(addr) = envelope_addr.as_deref() {
        let selected = with_state(|state| state.selected_device.clone());
        if selected.as_deref().is_some_and(|selected| selected != addr) {
            return Err(format!("收到其他设备的 Interconnect 回包：{addr}"));
        }
    }
    if response.get("v").and_then(Value::as_u64) != Some(1) {
        return Err("收到不支持的 JSLab 同步协议".into());
    }
    match response.get("type").and_then(Value::as_str) {
        Some("event") => {
            let event = response
                .get("event")
                .and_then(Value::as_str)
                .unwrap_or_default();
            diagnostic(format!("PUSH event={event}"));
            if event == "filesChanged" {
                set_status("检测到手环文件变化，正在刷新", true);
                request_list().await?;
            }
            return Ok(());
        }
        Some("response") => {}
        _ => return Err("收到不支持的 JSLab 同步消息类型".into()),
    }
    with_state(|state| state.channel_ready = true);
    let id = response
        .get("id")
        .and_then(Value::as_str)
        .ok_or("回包缺少请求 ID")?;
    let timer_id = with_state(|state| state.request_timers.remove(id));
    if let Some(timer_id) = timer_id {
        timer::clear_timer(timer_id).await;
    }
    let pending = with_state(|state| state.pending.remove(id))
        .ok_or_else(|| "收到已过期的同步回包".to_string())?;
    diagnostic(format!(
        "RESPONSE matched id={id} ok={:?} timer={timer_id:?}",
        response.get("ok").and_then(Value::as_bool)
    ));
    if response.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(response
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("手环端操作失败")
            .to_string());
    }
    let result = response.get("result").cloned().unwrap_or_else(|| json!({}));

    match pending {
        Pending::Hello => {
            if result.get("protocol").and_then(Value::as_u64) != Some(1) {
                return Err("JSLab 同步协议版本不兼容".into());
            }
            set_status("握手成功，正在读取文件", true);
            request_list().await?;
            request_font_config().await?;
        }
        Pending::List => {
            let files = result
                .get("files")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|file| {
                    Some(FileMeta {
                        name: file.get("name")?.as_str()?.to_string(),
                        size: file
                            .get("size")
                            .and_then(|size| {
                                size.as_str()
                                    .and_then(|v| v.parse().ok())
                                    .or_else(|| size.as_u64().map(|v| v as usize))
                            })
                            .unwrap_or(0),
                    })
                })
                .collect::<Vec<_>>();
            with_state(|state| {
                state.files = files;
                if state
                    .selected_file
                    .as_ref()
                    .is_some_and(|name| !state.files.iter().any(|file| &file.name == name))
                {
                    state.selected_file = None;
                }
                if !state.editor_name.is_empty()
                    && !state
                        .files
                        .iter()
                        .any(|file| file.name == state.editor_name)
                {
                    state.editor_name.clear();
                    state.editor_text.clear();
                    state.editor_original.clear();
                    state.editor_dirty = false;
                }
                state.status = format!("已同步 {} 个文件", state.files.len());
                state.error = None;
                state.busy = !state.pending.is_empty();
            });
            render_current();
        }
        Pending::FontConfig | Pending::FontConfigSet => {
            let metrics = parse_font_metrics(&result)?;
            with_state(|state| {
                state.font_metrics = metrics;
                state.status = if matches!(pending, Pending::FontConfigSet) {
                    "编辑器度量已保存".into()
                } else {
                    "已同步编辑器字体配置".into()
                };
                state.error = None;
                state.busy = !state.pending.is_empty();
            });
            render_current();
        }
        Pending::Read { name, mut content } => {
            let chunk = result
                .get("content")
                .and_then(Value::as_str)
                .ok_or("读取回包缺少内容")?;
            content.push_str(chunk);
            if content.len() > MAX_SCRIPT_BYTES {
                return Err("手环返回的脚本超过 48 KiB".into());
            }
            let next_offset = result
                .get("nextOffset")
                .and_then(Value::as_u64)
                .ok_or("读取回包缺少偏移")? as usize;
            let done = result.get("done").and_then(Value::as_bool).unwrap_or(false);
            let total = result
                .get("size")
                .and_then(Value::as_u64)
                .unwrap_or(content.len() as u64) as usize;
            if done {
                with_state(|state| {
                    state.editor_name = name;
                    state.editor_original = content.clone();
                    state.editor_text = content;
                    state.editor_dirty = false;
                    state.status = "文件已载入编辑器".into();
                    state.busy = !state.pending.is_empty();
                });
                render_current();
            } else {
                set_status(
                    format!(
                        "正在读取 {} · {} / {}",
                        name,
                        format_size(content.len()),
                        format_size(total)
                    ),
                    true,
                );
                send_request(
                    "read",
                    json!({ "name": name, "offset": next_offset }),
                    Pending::Read { name, content },
                )
                .await?;
            }
        }
        Pending::WriteStart {
            name,
            content,
            success_message,
            update_editor_clean,
        } => {
            let transfer_id = result
                .get("transferId")
                .and_then(Value::as_str)
                .ok_or("写入回包缺少会话 ID")?
                .to_string();
            send_next_write_chunk(
                transfer_id,
                name,
                content,
                0,
                0,
                success_message,
                update_editor_clean,
            )
            .await?;
        }
        Pending::WriteChunk {
            transfer_id,
            name,
            content,
            offset,
            index,
            success_message,
            update_editor_clean,
        } => {
            send_next_write_chunk(
                transfer_id,
                name,
                content,
                offset,
                index,
                success_message,
                update_editor_clean,
            )
            .await?;
        }
        Pending::WriteFinish {
            success_message,
            update_editor_clean,
        } => {
            with_state(|state| {
                state.status = success_message;
                if update_editor_clean {
                    state.editor_original = state.editor_text.clone();
                    state.editor_dirty = false;
                }
                state.busy = !state.pending.is_empty();
            });
            request_list().await?;
        }
        Pending::Mutation { success_message } => {
            with_state(|state| {
                state.status = success_message;
                state.busy = !state.pending.is_empty();
            });
            request_list().await?;
        }
    }
    Ok(())
}

async fn save_download(name: &str, data: &[u8]) -> Result<(), String> {
    set_status(format!("请选择 {} 的保存位置", name), true);
    let session = dialog::save_file_start(&FilterConfig {
        multiple: false,
        extensions: vec!["js".into()],
        default_directory: String::new(),
        default_file_name: name.into(),
    })
    .await
    .map_err(|_| "已取消下载".to_string())?;
    for chunk in data.chunks(WRITE_CHUNK_BYTES) {
        if dialog::save_file_write_chunk(session.session_id, chunk)
            .await
            .is_err()
        {
            dialog::save_file_abort(session.session_id).await;
            return Err("写入下载文件失败".into());
        }
    }
    if dialog::save_file_finish(session.session_id).await.is_err() {
        dialog::save_file_abort(session.session_id).await;
        return Err("完成下载文件失败".into());
    }
    set_status(format!("已下载 {}", session.name), false);
    Ok(())
}

async fn prompt_text(title: &str, content: &str) -> Option<String> {
    let result = dialog::show_dialog(
        DialogType::Input,
        DialogStyle::Website,
        &DialogInfo {
            title: title.into(),
            content: content.into(),
            buttons: vec![
                DialogButton {
                    id: "confirm".into(),
                    primary: true,
                    content: "确认".into(),
                },
                DialogButton {
                    id: "cancel".into(),
                    primary: false,
                    content: "取消".into(),
                },
            ],
        },
    )
    .await;
    (result.clicked_btn_id == "confirm").then(|| result.input_result.trim().to_string())
}

async fn confirm_delete(name: &str, has_unsaved_changes: bool) -> bool {
    let result = dialog::show_dialog(
        DialogType::Alert,
        DialogStyle::System,
        &DialogInfo {
            title: "删除文件".into(),
            content: if has_unsaved_changes {
                format!("{name} 包含未保存更改。确定删除？此操作无法撤销。")
            } else {
                format!("确定删除 {name}？此操作无法撤销。")
            },
            buttons: vec![
                DialogButton {
                    id: "delete".into(),
                    primary: true,
                    content: "删除".into(),
                },
                DialogButton {
                    id: "cancel".into(),
                    primary: false,
                    content: "取消".into(),
                },
            ],
        },
    )
    .await;
    result.clicked_btn_id == "delete"
}

async fn confirm_discard_changes(name: &str) -> bool {
    let result = dialog::show_dialog(
        DialogType::Alert,
        DialogStyle::System,
        &DialogInfo {
            title: "放弃未保存更改".into(),
            content: format!("{name} 的修改尚未保存，确定返回文件列表？"),
            buttons: vec![
                DialogButton {
                    id: "discard".into(),
                    primary: true,
                    content: "放弃更改".into(),
                },
                DialogButton {
                    id: "cancel".into(),
                    primary: false,
                    content: "继续编辑".into(),
                },
            ],
        },
    )
    .await;
    result.clicked_btn_id == "discard"
}

async fn confirm_overwrite(name: &str) -> bool {
    let result = dialog::show_dialog(
        DialogType::Alert,
        DialogStyle::System,
        &DialogInfo {
            title: "覆盖文件".into(),
            content: format!("手环中已存在 {name}，继续将替换原文件。"),
            buttons: vec![
                DialogButton {
                    id: "overwrite".into(),
                    primary: true,
                    content: "覆盖".into(),
                },
                DialogButton {
                    id: "cancel".into(),
                    primary: false,
                    content: "取消".into(),
                },
            ],
        },
    )
    .await;
    result.clicked_btn_id == "overwrite"
}

fn parse_metric_input(value: &str, label: &str, minimum: f64, maximum: f64) -> Result<f64, String> {
    let parsed = value.parse::<f64>().map_err(|_| format!("{label} 必须是数字"))?;
    if !parsed.is_finite() || parsed < minimum || parsed > maximum {
        return Err(format!("{label} 必须在 {minimum} 到 {maximum} 之间"));
    }
    Ok(parsed)
}

async fn edit_font_metric(event_id: &str) -> Result<(), String> {
    let current = with_state(|state| state.font_metrics.clone());
    let (title, content, minimum, maximum, current_value) = match event_id {
        "font-line-height" => ("设置行高倍率", "输入 0.8 到 2.5，例如 1.2", 0.8, 2.5, current.line_height_ratio),
        "font-line-offset" => ("设置行高偏移", "输入 -8 到 12（px）", -8.0, 12.0, current.line_height_offset),
        "font-ascii-width" => ("设置 ASCII 字宽", "输入 0.3 到 1.2，例如 0.5", 0.3, 1.2, current.ascii_width_ratio),
        "font-wide-width" => ("设置宽字符字宽", "输入 0.5 到 2.5，例如 1", 0.5, 2.5, current.wide_width_ratio),
        _ => return Ok(()),
    };
    let Some(input) = prompt_text(title, &format!("{content}\n当前值：{current_value}")) .await else {
        return Ok(());
    };
    let value = parse_metric_input(&input, title, minimum, maximum)?;
    let mut next = current;
    match event_id {
        "font-line-height" => next.line_height_ratio = value,
        "font-line-offset" => next.line_height_offset = value,
        "font-ascii-width" => next.ascii_width_ratio = value,
        "font-wide-width" => next.wide_width_ratio = value,
        _ => {}
    }
    request_set_font_config(next).await
}

async fn handle_ui_event(event_id: &str, payload: &str) -> Result<(), String> {
    if event_id == "editor-input" {
        let value = input_value(payload);
        diagnostic(format!(
            "EDITOR input payload_bytes={} value_chars={} value_bytes={}",
            payload.len(),
            value.chars().count(),
            value.len()
        ));
        with_state(|state| {
            state.editor_dirty = value != state.editor_original;
            state.editor_text = value;
        });
        return Ok(());
    }
    if event_id == "device-refresh" {
        return start_device_refresh().await;
    }
    if let Some(index) = event_id
        .strip_prefix("device-select:")
        .and_then(|v| v.parse().ok())
    {
        return select_device(index).await;
    }
    if let Some(index) = event_id
        .strip_prefix("file-select:")
        .and_then(|v| v.parse::<usize>().ok())
    {
        let name = with_state(|state| {
            let name = state.files.get(index).map(|file| file.name.clone());
            state.selected_file = name.clone();
            state.editor_name.clear();
            state.editor_text.clear();
            state.editor_original.clear();
            state.editor_dirty = false;
            name
        })
        .ok_or_else(|| "文件列表已变化，请重试".to_string())?;
        render_current();
        if let Err(error) = request_read(name).await {
            with_state(|state| state.selected_file = None);
            render_current();
            return Err(error);
        }
        return Ok(());
    }
    if event_id == "files-refresh" {
        return request_list().await;
    }
    if event_id == "font-reset" {
        return request_set_font_config(FontMetrics::default()).await;
    }
    if matches!(event_id, "font-line-height" | "font-line-offset" | "font-ascii-width" | "font-wide-width") {
        return edit_font_metric(event_id).await;
    }
    if event_id == "editor-close" {
        let (name, dirty) = with_state(|state| (state.editor_name.clone(), state.editor_dirty));
        if dirty && !confirm_discard_changes(&name).await {
            return Ok(());
        }
        with_state(|state| {
            state.selected_file = None;
            state.editor_name.clear();
            state.editor_text.clear();
            state.editor_original.clear();
            state.editor_dirty = false;
            state.status = format!("已同步 {} 个文件", state.files.len());
        });
        render_current();
        return Ok(());
    }

    let selected = with_state(|state| state.selected_file.clone());
    match event_id {
        "file-new" => {
            if let Some(name) = prompt_text("新建脚本", "输入以 .js 结尾的文件名").await
            {
                if !valid_script_name(&name) {
                    return Err("文件名必须是不含路径的 .js 文件名".into());
                }
                let exists = with_state(|state| state.files.iter().any(|file| file.name == name));
                if exists {
                    return Err(format!("{name} 已存在，新建操作不会覆盖文件"));
                }
                send_request(
                    "create",
                    json!({ "name": name }),
                    Pending::Mutation {
                        success_message: format!("已新建 {name}"),
                    },
                )
                .await?;
            }
        }
        "file-rename" => {
            let old_name = selected.ok_or("请先选择文件")?;
            let dirty = with_state(|state| state.editor_dirty);
            if dirty {
                return Err("请先保存当前更改，再重命名文件".into());
            }
            if let Some(new_name) =
                prompt_text("重命名脚本", &format!("当前文件：{old_name}")).await
            {
                if !valid_script_name(&new_name) {
                    return Err("文件名必须是不含路径的 .js 文件名".into());
                }
                if new_name == old_name {
                    set_status("文件名未更改", false);
                    return Ok(());
                }
                let exists =
                    with_state(|state| state.files.iter().any(|file| file.name == new_name));
                if exists {
                    return Err(format!("{new_name} 已存在，重命名操作不会覆盖文件"));
                }
                send_request(
                    "rename",
                    json!({ "name": old_name, "newName": new_name }),
                    Pending::Mutation {
                        success_message: format!("已重命名为 {new_name}"),
                    },
                )
                .await?;
            }
        }
        "file-delete" => {
            let name = selected.ok_or("请先选择文件")?;
            let dirty = with_state(|state| state.editor_dirty);
            if confirm_delete(&name, dirty).await {
                send_request(
                    "delete",
                    json!({ "name": name }),
                    Pending::Mutation {
                        success_message: format!("已删除 {name}"),
                    },
                )
                .await?;
            }
        }
        "file-upload" => {
            let picked = dialog::pick_file(
                &PickConfig {
                    read: true,
                    copy_to: None,
                },
                &FilterConfig {
                    multiple: false,
                    extensions: vec!["js".into()],
                    default_directory: String::new(),
                    default_file_name: String::new(),
                },
            )
            .await;
            if !picked.name.is_empty() {
                if picked.data.len() > MAX_SCRIPT_BYTES {
                    return Err("上传文件不能超过 48 KiB".into());
                }
                let content = String::from_utf8(picked.data)
                    .map_err(|_| "上传文件必须是 UTF-8 文本".to_string())?;
                let name = picked
                    .name
                    .rsplit(['/', '\\'])
                    .next()
                    .unwrap_or(&picked.name)
                    .to_string();
                let exists = with_state(|state| state.files.iter().any(|file| file.name == name));
                if exists && !confirm_overwrite(&name).await {
                    set_status("已取消上传", false);
                    return Ok(());
                }
                request_write(
                    name.clone(),
                    content,
                    format!("已上传 {name}"),
                    exists,
                    false,
                )
                .await?;
            }
        }
        "file-download" => {
            let (name, content) =
                with_state(|state| (state.editor_name.clone(), state.editor_text.clone()));
            if name.is_empty() {
                return Err("文件仍在载入，请稍候".into());
            }
            save_download(&name, content.as_bytes()).await?;
        }
        "editor-save" => {
            let (name, content) =
                with_state(|state| (state.editor_name.clone(), state.editor_text.clone()));
            if name.is_empty() {
                return Err("编辑器中没有已打开文件".into());
            }
            request_write(name.clone(), content, format!("已保存 {name}"), true, true).await?;
        }
        _ => {}
    }
    Ok(())
}

async fn handle_timer(payload: &str) -> Result<(), String> {
    diagnostic(format!("TIMER event raw={payload}"));
    let value: Value =
        serde_json::from_str(payload).map_err(|_| "收到无法解析的计时器事件".to_string())?;
    let request_id = value
        .get("payload")
        .and_then(Value::as_str)
        .unwrap_or_default();
    diagnostic(format!("TIMER dispatch payload={request_id}"));
    if let Some(retry) = request_id.strip_prefix(DISCOVERY_RETRY_PREFIX) {
        let mut parts = retry.split(':');
        let generation = parts.next().and_then(|value| value.parse::<u64>().ok());
        let attempt = parts.next().and_then(|value| value.parse::<u32>().ok());
        if parts.next().is_none() {
            if let (Some(generation), Some(attempt)) = (generation, attempt) {
                return refresh_devices(generation, attempt).await;
            }
        }
        return Err("收到无效的设备重试事件".into());
    }
    if let Some(addr) = request_id.strip_prefix(CONNECT_TIMER_PREFIX) {
        return connect_interconnect(addr).await;
    }
    let expired = with_state(|state| {
        state.request_timers.remove(request_id);
        let expired = state.pending.remove(request_id).is_some();
        if expired {
            state.busy = !state.pending.is_empty();
        }
        expired
    });
    if expired {
        diagnostic(format!("REQUEST timeout expired id={request_id}"));
        Err("手环响应超时，请检查连接后重试".into())
    } else {
        diagnostic(format!("TIMER ignored completed id={request_id}"));
        Ok(())
    }
}

impl LifecycleGuest for Plugin {
    fn on_load() {
        let _ = state();
        diagnostic("LIFECYCLE on_load version=1.2.0 api_level=3 protocol=1");
    }
}

impl EventGuest for Plugin {
    fn on_event(
        event_type: EventType,
        event_payload: String,
    ) -> astrobox_ng_wit::FutureReader<String> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<String>(String::new);
        diagnostic(format!(
            "HOST_EVENT type={event_type:?} payload_bytes={} payload={}",
            event_payload.len(),
            event_payload.chars().take(240).collect::<String>()
        ));
        let result = astrobox_ng_wit::block_on(async move {
            let result = match event_type {
                EventType::InterconnectMessage => {
                    process_interconnect_message(&event_payload).await
                }
                EventType::Timer => handle_timer(&event_payload).await,
                EventType::DeviceAction => start_device_refresh().await,
                _ => Ok(()),
            };
            result
        });
        if let Err(error) = result {
            set_error(error);
        }
        astrobox_ng_wit::spawn(async move {
            let _ = writer.write(String::new()).await;
        });
        reader
    }

    fn on_ui_event_v3(
        event_id: String,
        event: Event,
        event_payload: String,
    ) -> astrobox_ng_wit::FutureReader<String> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<String>(String::new);
        diagnostic(format!(
            "UI_EVENT id={event_id} type={event:?} payload_bytes={}",
            event_payload.len()
        ));
        let result = astrobox_ng_wit::block_on(handle_ui_event(&event_id, &event_payload));
        if let Err(error) = result {
            set_error(error);
        }
        astrobox_ng_wit::spawn(async move {
            let _ = writer.write(String::new()).await;
        });
        reader
    }

    fn on_ui_render(element_id: String) -> astrobox_ng_wit::FutureReader<()> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<()>(|| ());

        diagnostic(format!("UI_RENDER element_id={element_id}"));
        with_state(|state| state.element_id = Some(element_id));
        render_current();

        if let Err(error) = astrobox_ng_wit::block_on(start_device_refresh()) {
            set_error(error);
        }

        astrobox_ng_wit::spawn(async move {
            let _ = writer.write(()).await;
        });
        reader
    }

    fn on_card_render(_card_id: String) -> astrobox_ng_wit::FutureReader<()> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<()>(|| ());
        astrobox_ng_wit::spawn(async move {
            let _ = writer.write(()).await;
        });
        reader
    }
}

astrobox_ng_wit::export!(Plugin);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_script_names() {
        assert!(valid_script_name("hello.js"));
        assert!(valid_script_name("中文.js"));
        assert!(!valid_script_name("../hello.js"));
        assert!(!valid_script_name("hello.txt"));
        assert!(!valid_script_name("folder/hello.js"));
    }

    #[test]
    fn chunks_without_splitting_utf8() {
        let content = format!("{}中", "a".repeat(4095));
        let (first, offset) = next_utf8_chunk(&content, 0);
        assert_eq!(first.len(), 4095);
        assert!(content.is_char_boundary(offset));
        let (second, end) = next_utf8_chunk(&content, offset);
        assert_eq!(second, "中");
        assert_eq!(end, content.len());
    }

    #[test]
    fn extracts_v3_input_payloads() {
        assert_eq!(input_value("plain"), "plain");
        assert_eq!(input_value(r#"{"value":"one"}"#), "one");
        assert_eq!(input_value(r#"{"detail":{"value":"two"}}"#), "two");
        assert_eq!(
            input_value(r#"{"currentTarget":{"text":"three"}}"#),
            "three"
        );
        assert_eq!(input_value(r#"{"event":{"content":"four"}}"#), "four");
    }

    #[test]
    fn discovery_retry_payload_is_unambiguous() {
        let payload = format!("{DISCOVERY_RETRY_PREFIX}12:3");
        let retry = payload.strip_prefix(DISCOVERY_RETRY_PREFIX).unwrap();
        let parts = retry.split(':').collect::<Vec<_>>();
        assert_eq!(parts, ["12", "3"]);
    }

    #[test]
    fn decodes_direct_and_host_wrapped_interconnect_responses() {
        let response = r#"{"v":1,"type":"response","id":"p1","ok":true,"result":{}}"#;
        let (direct, addr, package) = decode_interconnect_response(response).unwrap();
        assert_eq!(direct["id"], "p1");
        assert!(addr.is_none());
        assert!(package.is_none());

        let wrapped = json!({
            "addr": "D0:AE:05:12:C7:59",
            "pkgName": PACKAGE_NAME,
            "payloadText": response,
        })
        .to_string();
        let (decoded, addr, package) = decode_interconnect_response(&wrapped).unwrap();
        assert_eq!(decoded["id"], "p1");
        assert_eq!(addr.as_deref(), Some("D0:AE:05:12:C7:59"));
        assert_eq!(package.as_deref(), Some(PACKAGE_NAME));
    }

    #[test]
    fn decodes_hex_only_interconnect_envelopes() {
        let wrapped = json!({
            "payloadHex": "7b2276223a312c2274797065223a22726573706f6e7365227d"
        })
        .to_string();
        let (decoded, _, _) = decode_interconnect_response(&wrapped).unwrap();
        assert_eq!(decoded["v"], 1);
        assert_eq!(decoded["type"], "response");
    }
}
