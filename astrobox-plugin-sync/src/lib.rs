use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

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
use waki::{Client as HttpClient, Method as HttpMethod};

const PACKAGE_NAME: &str = "icu.ccicc.jslab";
const PROTOCOL_VERSION: u64 = 2;
const MAX_SCRIPT_BYTES: usize = 48 * 1024;
const MAX_FONT_BYTES: usize = 2 * 1024 * 1024;
const FONT_CHUNK_BYTES: usize = 3 * 1024;
const WRITE_CHUNK_BYTES: usize = 4096;
const DISCOVERY_RETRY_PREFIX: &str = "jslab-discovery:";
const DISCOVERY_RETRY_DELAY_MS: u64 = 2_000;
const MAX_DISCOVERY_ATTEMPTS: u32 = 15;
const CONNECT_TIMER_PREFIX: &str = "jslab-connect:";
const MAX_CLOUD_REQUEST_BYTES: usize = 64 * 1024;
const MAX_CLOUD_RESPONSE_BYTES: usize = 128 * 1024;

struct Plugin;

#[derive(Clone, Copy, PartialEq)]
enum ActivePage {
    Files,
    Fonts,
}

enum Pending {
    Hello,
    List,
    FontUploadStart {
        name: String,
        data: Vec<u8>,
    },
    FontUploadChunk {
        transfer_id: String,
        name: String,
        data: Vec<u8>,
        offset: usize,
        index: usize,
    },
    FontUploadFinish {
        name: String,
    },
    Read {
        name: String,
        content: String,
        offset: usize,
        total: Option<usize>,
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
        name: String,
        content: String,
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

#[derive(Clone)]
struct FontPackageData {
    name: String,
    source_name: String,
    format: String,
    metrics: FontMetrics,
}

struct FontDraft {
    source_name: String,
    data: Vec<u8>,
    name: String,
    line_height_ratio: String,
    line_height_offset: String,
    ascii_width_ratio: String,
    wide_width_ratio: String,
}

#[derive(Clone)]
struct FontDraftView {
    source_name: String,
    size: usize,
    name: String,
    line_height_ratio: String,
    line_height_offset: String,
    ascii_width_ratio: String,
    wide_width_ratio: String,
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
    font_draft: Option<FontDraft>,
    active_page: ActivePage,
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
    transfer_progress: Option<TransferProgress>,
}

#[derive(Clone)]
struct TransferProgress {
    current: usize,
    total: usize,
    stage: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
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
    font_draft: Option<FontDraftView>,
    active_page: ActivePage,
    selected_file: Option<String>,
    editor_name: String,
    editor_text: String,
    status: String,
    error: Option<String>,
    busy: bool,
    transfer_progress: Option<TransferProgress>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            element_id: None,
            devices: Vec::new(),
            selected_device: None,
            channel_ready: false,
            files: Vec::new(),
            font_draft: None,
            active_page: ActivePage::Files,
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
            transfer_progress: None,
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
        font_draft: state.font_draft.as_ref().map(|draft| FontDraftView {
            source_name: draft.source_name.clone(),
            size: draft.data.len(),
            name: draft.name.clone(),
            line_height_ratio: draft.line_height_ratio.clone(),
            line_height_offset: draft.line_height_offset.clone(),
            ascii_width_ratio: draft.ascii_width_ratio.clone(),
            wide_width_ratio: draft.wide_width_ratio.clone(),
        }),
        active_page: state.active_page,
        selected_file: state.selected_file.clone(),
        editor_name: state.editor_name.clone(),
        editor_text: state.editor_text.clone(),
        status: state.status.clone(),
        error: state.error.clone(),
        busy: state.busy,
        transfer_progress: state.transfer_progress.clone(),
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
        state.busy = !state.pending.is_empty();
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

fn set_transfer_progress(current: usize, total: usize, stage: impl Into<String>) {
    with_state(|state| {
        state.transfer_progress = Some(TransferProgress {
            current: usize::min(current, total),
            total,
            stage: stage.into(),
        });
    });
}

fn invalidate_device_session(state: &mut AppState) -> Vec<u64> {
    state.channel_ready = false;
    state.pending.clear();
    state.busy = false;
    state.transfer_progress = None;
    state.files.clear();
    state.selected_file = None;
    state.request_timers.drain().map(|(_, id)| id).collect()
}

async fn clear_request_timers(timer_ids: Vec<u64>) {
    for timer_id in timer_ids {
        timer::clear_timer(timer_id).await;
    }
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

fn text_input(value: &str, placeholder: &str, event_id: &str) -> Element {
    Element::new(ElementType::Input, Some(value))
        .prop("type", "text")
        .prop("placeholder", placeholder)
        .width_full()
        .padding(10)
        .radius(6)
        .bg("#0B0D10")
        .text_color("#F3F5F7")
        .border(1, "#343B46")
        .on(Event::Input, event_id)
}

fn font_field(label_text: &str, value: &str, placeholder: &str, event_id: &str) -> Element {
    Element::new(ElementType::Div, None)
        .flex()
        .flex_direction(FlexDirection::Column)
        .gap(5)
        .child(label(label_text, "#AEB8C6", 13))
        .child(text_input(value, placeholder, event_id))
}

fn render(element_id: &str) {
    let view = snapshot();
    let device_online = view.selected_device.is_some();
    let connected = view.channel_ready;
    let editor_open = view.selected_file.is_some();
    let fonts_page = view.active_page == ActivePage::Fonts;

    let status_badge = Element::new(
        ElementType::Badge,
        Some(if connected {
            "已连接"
        } else if device_online {
            "设备在线"
        } else {
            "未连接"
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

    let page_action = if fonts_page {
        button("返回文件", "page-files", false, view.busy)
    } else {
        button("字体上传", "page-fonts", false, view.busy)
    };
    let header = Element::new(ElementType::Div, None)
        .flex()
        .flex_direction(FlexDirection::Row)
        .align_center()
        .gap(10)
        .child(label(
            if fonts_page {
                "JSLab 字体上传"
            } else {
                "JSLab 文件同步"
            },
            "#F5F7FA",
            22,
        ))
        .child(status_badge)
        .child(page_action)
        // Refresh is the recovery action for a stalled handshake, so it must
        // remain clickable while another request is marked busy.
        .child(button("刷新设备", "device-refresh", false, false));

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

    if let Some(progress) = &view.transfer_progress {
        let percent = progress
            .current
            .saturating_mul(100)
            .checked_div(progress.total)
            .unwrap_or(0)
            .min(100);
        root = root.child(
            Element::new(ElementType::Div, None)
                .flex()
                .flex_direction(FlexDirection::Column)
                .gap(5)
                .padding(10)
                .radius(6)
                .bg("#111419")
                .child(label(
                    format!(
                        "{} · {} / {} · {}%",
                        progress.stage,
                        format_size(progress.current),
                        format_size(progress.total),
                        percent
                    ),
                    "#AEB8C6",
                    13,
                ))
                .child(
                    Element::new(ElementType::Progress, None)
                        .prop("value", &percent.to_string())
                        .prop("max", "100")
                        .width_full()
                        .height(10),
                ),
        );
    }

    if fonts_page {
        let mut font_panel = Element::new(ElementType::Div, None)
            .flex()
            .flex_direction(FlexDirection::Column)
            .gap(10)
            .padding(14)
            .radius(6)
            .bg("#111419")
            .child(label("上传字体", "#DCE2EA", 20))
            .child(label("选择一个 TTF/OTF 文件，并填写该字体配套的名称、行高和字宽数据。上传会覆盖上一个待安装字体包。", "#AEB8C6", 14))
            .child(
                Element::new(ElementType::Div, None)
                    .flex()
                    .flex_direction(FlexDirection::Row)
                    .gap(6)
                    .child(button(
                        if view.font_draft.is_some() {
                            "重新选择字体"
                        } else {
                            "选择字体"
                        },
                        "font-select",
                        true,
                        view.busy,
                    )),
            );
        if let Some(draft) = &view.font_draft {
            font_panel = font_panel
                .child(label(
                    format!("{} · {}", draft.source_name, format_size(draft.size)),
                    "#DCE2EA",
                    15,
                ))
                .child(font_field(
                    "显示名称",
                    &draft.name,
                    "例如 Sarasa Term SC Nerd",
                    "font-name-input",
                ))
                .child(font_field(
                    "行高倍率（0.8 - 2.5）",
                    &draft.line_height_ratio,
                    "例如 1",
                    "font-line-height-input",
                ))
                .child(font_field(
                    "行高偏移（-8 - 12 px）",
                    &draft.line_height_offset,
                    "例如 0",
                    "font-line-offset-input",
                ))
                .child(font_field(
                    "ASCII 字宽（0.3 - 1.2）",
                    &draft.ascii_width_ratio,
                    "例如 0.5",
                    "font-ascii-width-input",
                ))
                .child(font_field(
                    "宽字符字宽（0.5 - 2.5）",
                    &draft.wide_width_ratio,
                    "例如 1",
                    "font-wide-width-input",
                ))
                .child(
                    Element::new(ElementType::Div, None)
                        .flex()
                        .flex_direction(FlexDirection::Row)
                        .gap(8)
                        .child(button(
                            "上传待安装字体包",
                            "font-submit",
                            true,
                            view.busy || !connected,
                        ))
                        .child(button("取消", "font-cancel", false, view.busy)),
                );
        }
        root = root.child(font_panel);
        ui_v3::render(element_id, root);
        return;
    }

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
        let editor = if view.busy { editor.disabled() } else { editor };
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

fn valid_font_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && (name.to_ascii_lowercase().ends_with(".ttf")
            || name.to_ascii_lowercase().ends_with(".otf"))
        && !name.contains("..")
        && !name
            .chars()
            .any(|c| c.is_control() || c == '/' || c == '\\')
}

fn percent_decode_picker_name(value: &str) -> String {
    fn hex_value(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }

    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%'
            && index + 2 < bytes.len()
            && let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
        {
            decoded.push((high << 4) | low);
            index += 3;
            continue;
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

// Android document providers may return a content URI instead of a plain file name.
// This produces only a local filename; valid_script_name/valid_font_name still reject
// paths and unsafe values before anything reaches the device.
fn picker_file_name(value: &str) -> String {
    let without_query = value.trim().split(['?', '#']).next().unwrap_or_default();
    let decoded = percent_decode_picker_name(without_query);
    decoded
        .rsplit(['/', '\\', ':'])
        .next()
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn encode_base64(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let a = chunk[0];
        let b = *chunk.get(1).unwrap_or(&0);
        let c = *chunk.get(2).unwrap_or(&0);
        output.push(TABLE[(a >> 2) as usize] as char);
        output.push(TABLE[(((a & 3) << 4) | (b >> 4)) as usize] as char);
        output.push(if chunk.len() > 1 {
            TABLE[(((b & 15) << 2) | (c >> 6)) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            TABLE[(c & 63) as usize] as char
        } else {
            '='
        });
    }
    output
}

fn font_fingerprint(data: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in data {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn font_checksum(data: &[u8]) -> String {
    const MODULUS: u32 = 65_521;
    let mut a = 1_u32;
    let mut b = 0_u32;
    for byte in data {
        a = (a + u32::from(*byte)) % MODULUS;
        b = (b + a) % MODULUS;
    }
    format!("{:08x}", (b << 16) | a)
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
    fn hex_nibble(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }

    if !value.is_ascii() {
        return Err("Interconnect payloadHex 内容无效".into());
    }
    let mut chunks = value.as_bytes().chunks_exact(2);
    if !chunks.remainder().is_empty() {
        return Err("Interconnect payloadHex 长度无效".into());
    }
    let bytes = chunks
        .by_ref()
        .map(|pair| {
            let high = hex_nibble(pair[0])
                .ok_or_else(|| "Interconnect payloadHex 内容无效".to_string())?;
            let low = hex_nibble(pair[1])
                .ok_or_else(|| "Interconnect payloadHex 内容无效".to_string())?;
            Ok((high << 4) | low)
        })
        .collect::<Result<Vec<_>, String>>()?;
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

async fn start_device_refresh(force: bool) -> Result<(), String> {
    if !force && with_state(|state| state.busy || !state.pending.is_empty()) {
        diagnostic("DISCOVERY deferred while an operation is active");
        return Ok(());
    }
    let (generation, timer_ids) = with_state(|state| {
        state.discovery_generation = state.discovery_generation.wrapping_add(1);
        let generation = state.discovery_generation;
        let timer_ids = invalidate_device_session(state);
        (generation, timer_ids)
    });
    clear_request_timers(timer_ids).await;
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
    let (selected, timer_ids, reuse_connection) = with_state(|state| {
        let previous = state.selected_device.clone();
        let was_ready = state.channel_ready;
        state.devices = devices;
        let selected = previous
            .as_ref()
            .filter(|addr| {
                state
                    .devices
                    .iter()
                    .any(|device| device.addr.as_str() == addr.as_str())
            })
            .cloned()
            .or_else(|| state.devices.first().map(|d| d.addr.clone()));
        let changed = selected != previous;
        state.selected_device = selected.clone();
        let timer_ids = if changed {
            invalidate_device_session(state)
        } else {
            Vec::new()
        };
        (selected, timer_ids, !changed && was_ready)
    });
    clear_request_timers(timer_ids).await;

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

    if reuse_connection {
        set_status("设备连接保持可用", false);
        return Ok(());
    }

    launch_jslab(&addr).await
}

async fn select_device(index: usize) -> Result<(), String> {
    let (addr, timer_ids) = with_state(|state| {
        let addr = state.devices.get(index).map(|device| device.addr.clone());
        let timer_ids = match &addr {
            Some(addr) if state.selected_device.as_deref() != Some(addr) => {
                state.selected_device = Some(addr.clone());
                invalidate_device_session(state)
            }
            Some(_) => Vec::new(),
            None => Vec::new(),
        };
        (addr, timer_ids)
    });
    let addr = addr.ok_or_else(|| "设备已离线，请刷新设备".to_string())?;
    clear_request_timers(timer_ids).await;
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
        .ok_or_else(|| "设备上未安装 JSLab 1.8.1 或更高版本".to_string())?;
    if app.version_code < 181 {
        return Err(format!(
            "手环端 JSLab 版本过旧（versionCode={}），请安装 1.8.1 或更高版本",
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
        "v": PROTOCOL_VERSION,
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

fn cloud_proxy_request(payload: &Value) -> Result<(HttpMethod, String, Vec<(String, String)>, Vec<u8>), String> {
    let url = payload
        .get("url")
        .and_then(Value::as_str)
        .ok_or("cloud proxy request is missing url")?;
    if url.len() > 2_048 {
        return Err("cloud proxy URL is too long".into());
    }
    let method = match payload.get("method").and_then(Value::as_str).unwrap_or("GET") {
        "GET" => HttpMethod::Get,
        "POST" => HttpMethod::Post,
        "PUT" => HttpMethod::Put,
        "DELETE" => HttpMethod::Delete,
        _ => return Err("cloud proxy method is not permitted".into()),
    };
    let body = payload
        .get("body")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .as_bytes()
        .to_vec();
    if body.len() > MAX_CLOUD_REQUEST_BYTES {
        return Err("cloud proxy request body is too large".into());
    }
    let mut headers = Vec::new();
    if let Some(values) = payload.get("headers").and_then(Value::as_object) {
        if values.len() > 3 {
            return Err("cloud proxy has too many headers".into());
        }
        for (name, value) in values {
            let lower = name.to_ascii_lowercase();
            if lower != "authorization" && lower != "content-type" && lower != "accept" {
                return Err("cloud proxy header is not permitted".into());
            }
            let value = value.as_str().ok_or("cloud proxy header is invalid")?;
            if value.len() > 1_024 || value.contains('\r') || value.contains('\n') {
                return Err("cloud proxy header is invalid".into());
            }
            headers.push((name.clone(), value.to_string()));
        }
    }
    Ok((method, url.to_string(), headers, body))
}

fn forward_cloud_request(payload: &Value) -> Result<Value, String> {
    let (method, url, headers, body) = cloud_proxy_request(payload)?;
    let mut request = HttpClient::new().request(method, &url);
    for (name, value) in headers {
        request = if name.eq_ignore_ascii_case("authorization") {
            request.header("Authorization", value)
        } else if name.eq_ignore_ascii_case("content-type") {
            request.header("Content-Type", value)
        } else {
            request.header("Accept", value)
        };
    }
    let response = request
        .body(body)
        .connect_timeout(Duration::from_secs(10))
        .send()
        .map_err(|_| "cloud proxy network request failed".to_string())?;
    let status = response.status_code();
    let content_type = response
        .header("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let mut body = Vec::new();
    while let Some(mut chunk) = response
        .chunk(8 * 1024)
        .map_err(|_| "cloud proxy response read failed".to_string())?
    {
        if body.len() + chunk.len() > MAX_CLOUD_RESPONSE_BYTES {
            return Err("cloud proxy response is too large".into());
        }
        body.append(&mut chunk);
    }
    let body = String::from_utf8(body).map_err(|_| "cloud proxy response is not UTF-8".to_string())?;
    Ok(json!({
        "status": status,
        "headers": { "content-type": content_type },
        "body": body,
    }))
}

async fn send_cloud_proxy_response(addr: &str, id: &str, result: Result<Value, String>) -> Result<(), String> {
    let message = match result {
        Ok(result) => json!({ "v": PROTOCOL_VERSION, "type": "response", "id": id, "ok": true, "result": result }),
        Err(error) => json!({ "v": PROTOCOL_VERSION, "type": "response", "id": id, "ok": false, "error": error }),
    }
    .to_string();
    interconnect::send_qaic_message(addr, PACKAGE_NAME, &message)
        .await
        .map_err(|_| "cloud proxy response delivery failed".to_string())
}

fn start_cloud_proxy(addr: String, id: String, payload: Value) {
    astrobox_ng_wit::spawn(async move {
        let result = forward_cloud_request(&payload);
        diagnostic(format!(
            "CLOUD_PROXY completed id={id} status={}",
            result.as_ref().ok().and_then(|value| value.get("status")).and_then(Value::as_u64).unwrap_or(0)
        ));
        if let Err(error) = send_cloud_proxy_response(&addr, &id, result).await {
            set_error(error);
        }
    });
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

async fn request_font_upload(
    source_name: String,
    data: Vec<u8>,
    profile: FontPackageData,
) -> Result<(), String> {
    if !valid_font_name(&source_name) {
        return Err("字体文件名必须是不含路径的 .ttf 或 .otf".into());
    }
    if data.is_empty() || data.len() > MAX_FONT_BYTES {
        return Err("字体不能超过 2 MiB".into());
    }
    set_transfer_progress(0, data.len(), "准备上传字体");
    set_status(format!("正在上传字体包 {}", profile.name), true);
    send_request(
        "fontUploadStart",
        json!({
            "size": data.len(),
            "fingerprint": font_fingerprint(&data),
            "checksum": font_checksum(&data),
            "profile": {
                "name": profile.name,
                "sourceName": profile.source_name,
                "format": profile.format,
                "lineHeightRatio": profile.metrics.line_height_ratio,
                "lineHeightOffset": profile.metrics.line_height_offset,
                "asciiWidthRatio": profile.metrics.ascii_width_ratio,
                "wideWidthRatio": profile.metrics.wide_width_ratio,
            }
        }),
        Pending::FontUploadStart {
            name: source_name,
            data,
        },
    )
    .await
}

async fn send_next_font_chunk(
    transfer_id: String,
    name: String,
    data: Vec<u8>,
    offset: usize,
    index: usize,
) -> Result<(), String> {
    if offset >= data.len() {
        set_transfer_progress(data.len(), data.len(), "正在确认字体包");
        return send_request(
            "fontUploadFinish",
            json!({ "transferId": transfer_id }),
            Pending::FontUploadFinish { name },
        )
        .await;
    }
    let end = usize::min(offset + FONT_CHUNK_BYTES, data.len());
    set_transfer_progress(end, data.len(), "正在上传字体");
    set_status(
        format!(
            "正在上传 {} · {} / {}",
            name,
            format_size(end),
            format_size(data.len())
        ),
        true,
    );
    send_request(
        "fontUploadChunk",
        json!({ "transferId": transfer_id, "index": index, "content": encode_base64(&data[offset..end]) }),
        Pending::FontUploadChunk { transfer_id, name, data, offset: end, index: index + 1 },
    ).await
}

fn font_resume_cursor(result: &Value, total: usize) -> Result<(usize, usize), String> {
    let offset_value = result.get("bytes").and_then(Value::as_u64).unwrap_or(0);
    let index_value = result.get("nextIndex").and_then(Value::as_u64).unwrap_or(0);
    if offset_value > total as u64 {
        return Err("手环返回的字体续传偏移超过文件大小".into());
    }
    if index_value > (total / FONT_CHUNK_BYTES + 1) as u64 {
        return Err("手环返回的字体续传序号无效".into());
    }
    let offset = offset_value as usize;
    let index = index_value as usize;
    let expected = index
        .checked_mul(FONT_CHUNK_BYTES)
        .map(|value| usize::min(value, total))
        .ok_or_else(|| "手环返回的字体续传序号无效".to_string())?;
    if offset != expected {
        return Err("手环返回的字体续传进度不一致，请重新选择字体".into());
    }
    Ok((offset, index))
}

fn required_usize(result: &Value, field: &str, context: &str) -> Result<usize, String> {
    let value = result
        .get(field)
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("{context}缺少有效的 {field}"))?;
    usize::try_from(value).map_err(|_| format!("{context}的 {field} 超出支持范围"))
}

fn validate_read_chunk(
    result: &Value,
    offset: usize,
    previous_total: Option<usize>,
) -> Result<(&str, usize, bool), String> {
    let chunk = result
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| "读取回包缺少有效内容".to_string())?;
    let next_offset = required_usize(result, "nextOffset", "读取回包")?;
    let total = required_usize(result, "size", "读取回包")?;
    let done = result
        .get("done")
        .and_then(Value::as_bool)
        .ok_or_else(|| "读取回包缺少有效的 done".to_string())?;

    if total > MAX_SCRIPT_BYTES {
        return Err("手环返回的脚本超过 48 KiB".into());
    }
    if previous_total.is_some_and(|previous| previous != total) {
        return Err("读取过程中脚本总大小发生变化".into());
    }
    let expected_next = offset
        .checked_add(chunk.len())
        .ok_or_else(|| "读取回包偏移溢出".to_string())?;
    if next_offset != expected_next {
        return Err("读取回包的分块偏移不连续".into());
    }
    if next_offset > total {
        return Err("读取回包偏移超过脚本总大小".into());
    }
    if done {
        if next_offset != total {
            return Err("读取回包提前标记完成".into());
        }
    } else if next_offset == offset || next_offset >= total {
        return Err("读取回包未推进到下一个有效分块".into());
    }
    Ok((chunk, total, done))
}

fn validate_write_ack(result: &Value, offset: usize, index: usize) -> Result<(), String> {
    let acknowledged_offset = required_usize(result, "bytes", "写入回包")?;
    let acknowledged_index = required_usize(result, "nextIndex", "写入回包")?;
    if acknowledged_offset != offset || acknowledged_index != index {
        return Err("手环确认的脚本写入进度与发送进度不一致".into());
    }
    Ok(())
}

fn parse_file_list(result: &Value) -> Result<Vec<FileMeta>, String> {
    let entries = result
        .get("files")
        .and_then(Value::as_array)
        .ok_or_else(|| "文件列表回包缺少有效的 files 数组".to_string())?;
    let mut names = HashSet::with_capacity(entries.len());
    let mut files = Vec::with_capacity(entries.len());

    for entry in entries {
        let name = entry
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| "文件列表包含缺少名称的项目".to_string())?;
        if !valid_script_name(name) {
            return Err(format!("文件列表包含无效脚本名：{name}"));
        }
        if !names.insert(name.to_string()) {
            return Err(format!("文件列表包含重复脚本：{name}"));
        }

        let size_value = entry
            .get("size")
            .ok_or_else(|| format!("文件 {name} 缺少大小"))?;
        let size_u64 = match size_value {
            Value::Number(number) => number
                .as_u64()
                .ok_or_else(|| format!("文件 {name} 的大小无效"))?,
            Value::String(value) => value
                .parse::<u64>()
                .map_err(|_| format!("文件 {name} 的大小无效"))?,
            _ => return Err(format!("文件 {name} 的大小无效")),
        };
        let size =
            usize::try_from(size_u64).map_err(|_| format!("文件 {name} 的大小超出支持范围"))?;
        if size > MAX_SCRIPT_BYTES {
            return Err(format!("文件 {name} 超过 48 KiB"));
        }
        files.push(FileMeta {
            name: name.to_string(),
            size,
        });
    }
    Ok(files)
}

fn apply_completed_editor_save(
    state: &mut AppState,
    name: &str,
    content: &str,
    update_editor_clean: bool,
) {
    if update_editor_clean && state.editor_name == name {
        state.editor_original = content.to_string();
        state.editor_dirty = state.editor_text != content;
    }
}

async fn request_read(name: String) -> Result<(), String> {
    set_status(format!("正在读取 {name}"), true);
    send_request(
        "read",
        json!({ "name": name, "offset": 0 }),
        Pending::Read {
            name,
            content: String::new(),
            offset: 0,
            total: None,
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
                name,
                content,
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
    diagnostic(format!("INTERCONNECT received bytes={}", payload.len()));
    let (response, envelope_addr, envelope_package) = decode_interconnect_response(payload)?;
    diagnostic(format!(
        "RESPONSE envelope addr={} package={} decoded_bytes={}",
        envelope_addr.as_deref().unwrap_or("<none>"),
        envelope_package.as_deref().unwrap_or("<none>"),
        response.to_string().len()
    ));
    if let Some(package) = envelope_package.as_deref()
        && package != PACKAGE_NAME
    {
        diagnostic(format!(
            "RESPONSE ignored package={package} expected={PACKAGE_NAME}"
        ));
        return Ok(());
    }
    let selected = with_state(|state| state.selected_device.clone());
    let Some(selected) = selected else {
        diagnostic("RESPONSE ignored because no device session is active");
        return Ok(());
    };
    if let Some(addr) = envelope_addr.as_deref()
        && selected != addr
    {
        diagnostic(format!("RESPONSE ignored addr={addr} selected={selected}"));
        return Ok(());
    }
    if response.get("v").and_then(Value::as_u64) != Some(PROTOCOL_VERSION) {
        return Err("收到不支持的 JSLab 同步协议".into());
    }
    match response.get("type").and_then(Value::as_str) {
        Some("request") => {
            let id = response
                .get("id")
                .and_then(Value::as_str)
                .ok_or("cloud proxy request is missing id")?;
            if response.get("action").and_then(Value::as_str) != Some("cloudProxy") {
                return Err("unsupported Interconnect request action".into());
            }
            let addr = envelope_addr.ok_or("cloud proxy request is missing device address")?;
            start_cloud_proxy(addr, id.to_string(), response.get("payload").cloned().unwrap_or_else(|| json!({})));
            return Ok(());
        }
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
    let id = response
        .get("id")
        .and_then(Value::as_str)
        .ok_or("回包缺少请求 ID")?;
    let (pending, timer_id) = with_state(|state| {
        let pending = state.pending.remove(id);
        let timer_id = pending
            .as_ref()
            .and_then(|_| state.request_timers.remove(id));
        state.busy = !state.pending.is_empty();
        (pending, timer_id)
    });
    if let Some(timer_id) = timer_id {
        timer::clear_timer(timer_id).await;
    }
    let Some(pending) = pending else {
        diagnostic(format!("RESPONSE ignored stale id={id}"));
        return Ok(());
    };
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
            let compatible = result.get("protocol").and_then(Value::as_u64)
                == Some(PROTOCOL_VERSION)
                && result
                    .get("fontUploadResumeSupported")
                    .and_then(Value::as_bool)
                    == Some(true)
                && result.get("fontChunkBytes").and_then(Value::as_u64)
                    == Some(FONT_CHUNK_BYTES as u64)
                && result.get("fontChecksumAlgorithm").and_then(Value::as_str) == Some("adler32");
            if !compatible {
                with_state(|state| state.channel_ready = false);
                return Err("JSLab 同步协议版本不兼容".into());
            }
            with_state(|state| state.channel_ready = true);
            set_status("握手成功，正在读取文件", true);
            request_list().await?;
        }
        Pending::List => {
            let files = parse_file_list(&result)?;
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
        Pending::FontUploadStart { name, data } => {
            let transfer_id = result
                .get("transferId")
                .and_then(Value::as_str)
                .ok_or("字体上传回包缺少会话 ID")?
                .to_string();
            let (offset, index) = font_resume_cursor(&result, data.len())?;
            if offset > 0 {
                set_status(
                    format!("继续上传 {name} · 已完成 {}", format_size(offset)),
                    true,
                );
            }
            set_transfer_progress(
                offset,
                data.len(),
                if offset > 0 {
                    "正在续传字体"
                } else {
                    "正在上传字体"
                },
            );
            send_next_font_chunk(transfer_id, name, data, offset, index).await?;
        }
        Pending::FontUploadChunk {
            transfer_id,
            name,
            data,
            offset,
            index,
        } => {
            let acknowledged = font_resume_cursor(&result, data.len())?;
            if acknowledged != (offset, index) {
                return Err("手环确认的字体上传进度与发送进度不一致".into());
            }
            send_next_font_chunk(transfer_id, name, data, acknowledged.0, acknowledged.1).await?;
        }
        Pending::FontUploadFinish { name } => {
            with_state(|state| {
                state.font_draft = None;
                state.transfer_progress = None;
            });
            set_status(
                format!("{name} 字体包已上传：请在 JSLab 字体设置中发起安装"),
                false,
            );
        }
        Pending::Read {
            name,
            mut content,
            offset,
            total,
        } => {
            if content.len() != offset {
                return Err("读取脚本的本地分块状态不一致".into());
            }
            let (chunk, total, done) = validate_read_chunk(&result, offset, total)?;
            content.push_str(chunk);
            let next_offset = content.len();
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
                    Pending::Read {
                        name,
                        content,
                        offset: next_offset,
                        total: Some(total),
                    },
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
            validate_write_ack(&result, offset, index)?;
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
            name,
            content,
            success_message,
            update_editor_clean,
        } => {
            with_state(|state| {
                state.status = success_message;
                apply_completed_editor_save(state, &name, &content, update_editor_clean);
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
    let parsed = value
        .parse::<f64>()
        .map_err(|_| format!("{label} 必须是数字"))?;
    if !parsed.is_finite() || parsed < minimum || parsed > maximum {
        return Err(format!("{label} 必须在 {minimum} 到 {maximum} 之间"));
    }
    Ok(parsed)
}

fn build_font_profile(draft: &FontDraft) -> Result<FontPackageData, String> {
    let name = draft.name.trim().to_string();
    if name.is_empty()
        || name.chars().count() > 64
        || name.contains('"')
        || name.contains('\\')
        || name.chars().any(char::is_control)
    {
        return Err("字体名称必须为 1 到 64 个字符，且不能包含引号、反斜杠或控制字符".into());
    }
    let line_height_ratio =
        parse_metric_input(draft.line_height_ratio.trim(), "行高倍率", 0.8, 2.5)?;
    let line_height_offset =
        parse_metric_input(draft.line_height_offset.trim(), "行高偏移", -8.0, 12.0)?;
    let ascii_width_ratio =
        parse_metric_input(draft.ascii_width_ratio.trim(), "ASCII 字宽", 0.3, 1.2)?;
    let wide_width_ratio =
        parse_metric_input(draft.wide_width_ratio.trim(), "宽字符字宽", 0.5, 2.5)?;
    Ok(FontPackageData {
        name,
        source_name: draft.source_name.clone(),
        format: if draft.source_name.to_ascii_lowercase().ends_with(".otf") {
            "otf"
        } else {
            "ttf"
        }
        .into(),
        metrics: FontMetrics {
            line_height_ratio,
            line_height_offset,
            ascii_width_ratio,
            wide_width_ratio,
        },
    })
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
    if matches!(
        event_id,
        "font-name-input"
            | "font-line-height-input"
            | "font-line-offset-input"
            | "font-ascii-width-input"
            | "font-wide-width-input"
    ) {
        let value = input_value(payload);
        with_state(|state| {
            if let Some(draft) = &mut state.font_draft {
                match event_id {
                    "font-name-input" => draft.name = value,
                    "font-line-height-input" => draft.line_height_ratio = value,
                    "font-line-offset-input" => draft.line_height_offset = value,
                    "font-ascii-width-input" => draft.ascii_width_ratio = value,
                    "font-wide-width-input" => draft.wide_width_ratio = value,
                    _ => {}
                }
            }
        });
        return Ok(());
    }
    if event_id == "device-refresh" {
        return start_device_refresh(true).await;
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
    if event_id == "page-fonts" {
        with_state(|state| state.active_page = ActivePage::Fonts);
        render_current();
        return Ok(());
    }
    if event_id == "page-files" {
        with_state(|state| state.active_page = ActivePage::Files);
        render_current();
        return Ok(());
    }
    if event_id == "font-select" {
        let picked = dialog::pick_file(
            &PickConfig {
                read: true,
                copy_to: None,
            },
            &FilterConfig {
                multiple: false,
                extensions: vec!["ttf".into(), "otf".into()],
                default_directory: String::new(),
                default_file_name: String::new(),
            },
        )
        .await;
        if picked.name.is_empty() {
            return Ok(());
        }
        let name = picker_file_name(&picked.name);
        diagnostic(format!(
            "FONT picked name={name} bytes={}",
            picked.data.len()
        ));
        if !valid_font_name(&name) {
            return Err("请选择 .ttf 或 .otf 字体文件".into());
        }
        if picked.data.is_empty() {
            return Err("所选字体为空或 AstroBox 未能读取文件".into());
        }
        if picked.data.len() > MAX_FONT_BYTES {
            return Err("字体不能超过 2 MiB".into());
        }
        let display_name = name
            .rsplit_once('.')
            .map(|(base, _)| base)
            .unwrap_or(&name)
            .to_string();
        with_state(|state| {
            state.font_draft = Some(FontDraft {
                source_name: name.clone(),
                data: picked.data,
                name: display_name,
                line_height_ratio: "1".into(),
                line_height_offset: "0".into(),
                ascii_width_ratio: "0.5".into(),
                wide_width_ratio: "1".into(),
            });
            state.transfer_progress = None;
        });
        set_status(format!("已选择 {name}，请填写字体数据"), false);
        return Ok(());
    }
    if event_id == "font-cancel" {
        with_state(|state| {
            state.font_draft = None;
            state.transfer_progress = None;
        });
        set_status("已取消字体上传", false);
        return Ok(());
    }
    if event_id == "font-submit" {
        let profile = with_state(|state| {
            state
                .font_draft
                .as_ref()
                .map(build_font_profile)
                .transpose()
        })?
        .ok_or_else(|| "请先选择字体".to_string())?;
        let (source_name, data) = with_state(|state| {
            state
                .font_draft
                .as_ref()
                .map(|draft| (draft.source_name.clone(), draft.data.clone()))
        })
        .ok_or_else(|| "请先选择字体".to_string())?;
        return request_font_upload(source_name, data, profile).await;
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
                let name = picker_file_name(&picked.name);
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
        if parts.next().is_none()
            && let (Some(generation), Some(attempt)) = (generation, attempt)
        {
            return refresh_devices(generation, attempt).await;
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
        diagnostic("LIFECYCLE on_load version=1.5.5 api_level=3 protocol=2");
    }
}

impl EventGuest for Plugin {
    fn on_event(
        event_type: EventType,
        event_payload: String,
    ) -> astrobox_ng_wit::FutureReader<String> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<String>(String::new);
        diagnostic(format!("HOST_EVENT type={event_type:?} payload_bytes={}", event_payload.len()));
        let result = astrobox_ng_wit::block_on(async move {
            diagnostic(format!("TASK start host_event type={event_type:?}"));
            match event_type {
                EventType::InterconnectMessage => process_interconnect_message(&event_payload).await,
                EventType::Timer => handle_timer(&event_payload).await,
                EventType::DeviceAction => start_device_refresh(false).await,
                _ => Ok(()),
            }
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
        let result = astrobox_ng_wit::block_on(async move {
            diagnostic(format!("TASK start ui_event id={event_id}"));
            handle_ui_event(&event_id, &event_payload).await
        });
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

        let result = astrobox_ng_wit::block_on(async move {
            diagnostic("TASK start ui_render discovery");
            start_device_refresh(false).await
        });
        if let Err(error) = result {
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
    fn extracts_a_safe_name_from_mobile_picker_uris() {
        assert_eq!(picker_file_name("hello.js"), "hello.js");
        assert_eq!(
            picker_file_name("content://documents/document/primary%3ADownload%2Fhello.js"),
            "hello.js"
        );
        assert_eq!(
            picker_file_name("file:///storage/emulated/0/Download/hello.js?token=1"),
            "hello.js"
        );
        assert_eq!(picker_file_name("primary:Download\\hello.js"), "hello.js");
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
    fn builds_font_profile_from_page_fields() {
        let draft = FontDraft {
            source_name: "SarasaTermSCNerd-Misans-v2.ttf".into(),
            data: vec![0, 1, 2],
            name: " Sarasa Term SC Nerd ".into(),
            line_height_ratio: "1.5543".into(),
            line_height_offset: "0.4022".into(),
            ascii_width_ratio: "0.5".into(),
            wide_width_ratio: "1".into(),
        };
        let profile = build_font_profile(&draft).unwrap();
        assert_eq!(profile.name, "Sarasa Term SC Nerd");
        assert_eq!(profile.format, "ttf");
        assert_eq!(profile.metrics.line_height_ratio, 1.5543);
        assert_eq!(profile.metrics.line_height_offset, 0.4022);
        assert_eq!(profile.metrics.ascii_width_ratio, 0.5);
        assert_eq!(profile.metrics.wide_width_ratio, 1.0);
    }

    #[test]
    fn rejects_out_of_range_font_page_fields() {
        let draft = FontDraft {
            source_name: "font.otf".into(),
            data: vec![0],
            name: "Font".into(),
            line_height_ratio: "3".into(),
            line_height_offset: "0".into(),
            ascii_width_ratio: "0.5".into(),
            wide_width_ratio: "1".into(),
        };
        assert_eq!(
            build_font_profile(&draft).err().unwrap(),
            "行高倍率 必须在 0.8 到 2.5 之间"
        );
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
        let response = r#"{"v":2,"type":"response","id":"p1","ok":true,"result":{}}"#;
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

    #[test]
    fn rejects_non_ascii_or_malformed_hex_without_panicking() {
        assert!(decode_hex_utf8("0é0").is_err());
        assert!(decode_hex_utf8("abc").is_err());
        assert!(decode_hex_utf8("zz").is_err());
    }

    #[test]
    fn validates_contiguous_script_read_chunks() {
        let first = json!({
            "content": "中",
            "nextOffset": 3,
            "size": 6,
            "done": false,
        });
        assert_eq!(
            validate_read_chunk(&first, 0, None).unwrap(),
            ("中", 6, false)
        );

        let second = json!({
            "content": "文",
            "nextOffset": 6,
            "size": 6,
            "done": true,
        });
        assert_eq!(
            validate_read_chunk(&second, 3, Some(6)).unwrap(),
            ("文", 6, true)
        );
    }

    #[test]
    fn rejects_invalid_script_read_progress() {
        assert!(
            validate_read_chunk(
                &json!({ "content": "abc", "nextOffset": 2, "size": 3, "done": true }),
                0,
                None,
            )
            .is_err()
        );
        assert!(
            validate_read_chunk(
                &json!({ "content": "", "nextOffset": 0, "size": 3, "done": false }),
                0,
                None,
            )
            .is_err()
        );
        assert!(
            validate_read_chunk(
                &json!({ "content": "d", "nextOffset": 4, "size": 5, "done": false }),
                3,
                Some(4),
            )
            .is_err()
        );
    }

    #[test]
    fn validates_script_write_acknowledgements() {
        assert!(validate_write_ack(&json!({ "bytes": 4096, "nextIndex": 1 }), 4096, 1).is_ok());
        assert!(validate_write_ack(&json!({ "bytes": 4095, "nextIndex": 1 }), 4096, 1).is_err());
        assert!(validate_write_ack(&json!({ "bytes": 4096 }), 4096, 1).is_err());
    }

    #[test]
    fn parses_only_complete_valid_file_lists() {
        let files = parse_file_list(&json!({
            "files": [
                { "name": "new.js", "size": "12" },
                { "name": "old.js", "size": 34 },
            ]
        }))
        .unwrap();
        assert_eq!(
            files,
            vec![
                FileMeta {
                    name: "new.js".into(),
                    size: 12,
                },
                FileMeta {
                    name: "old.js".into(),
                    size: 34,
                },
            ]
        );

        assert!(parse_file_list(&json!({})).is_err());
        assert!(
            parse_file_list(&json!({
                "files": [
                    { "name": "same.js", "size": 1 },
                    { "name": "same.js", "size": 2 },
                ]
            }))
            .is_err()
        );
        assert!(
            parse_file_list(&json!({
                "files": [{ "name": "broken.txt", "size": 1 }]
            }))
            .is_err()
        );
    }

    #[test]
    fn completed_save_does_not_mark_newer_text_as_clean() {
        let mut state = AppState {
            editor_name: "demo.js".into(),
            editor_text: "newer text".into(),
            editor_original: "old text".into(),
            editor_dirty: true,
            ..AppState::default()
        };

        apply_completed_editor_save(&mut state, "demo.js", "uploaded text", true);
        assert_eq!(state.editor_original, "uploaded text");
        assert!(state.editor_dirty);

        state.editor_text = "uploaded text".into();
        apply_completed_editor_save(&mut state, "demo.js", "uploaded text", true);
        assert!(!state.editor_dirty);
    }

    #[test]
    fn validates_font_resume_cursor() {
        assert_eq!(font_resume_cursor(&json!({}), 10_000).unwrap(), (0, 0));
        assert_eq!(
            font_resume_cursor(&json!({ "bytes": 6144, "nextIndex": 2 }), 10_000).unwrap(),
            (6144, 2)
        );
        assert_eq!(
            font_resume_cursor(&json!({ "bytes": 10_000, "nextIndex": 4 }), 10_000).unwrap(),
            (10_000, 4)
        );
        assert!(font_resume_cursor(&json!({ "bytes": 5000, "nextIndex": 2 }), 10_000).is_err());
        assert!(font_resume_cursor(&json!({ "bytes": 10_001, "nextIndex": 4 }), 10_000).is_err());
    }

    #[test]
    fn fingerprints_font_content_deterministically() {
        assert_eq!(font_fingerprint(b""), "cbf29ce484222325");
        assert_eq!(font_fingerprint(b"font"), "dd0ef6790c22b410");
        assert_ne!(font_fingerprint(b"font-a"), font_fingerprint(b"font-b"));
    }

    #[test]
    fn checksums_font_content_deterministically() {
        assert_eq!(font_checksum(b""), "00000001");
        assert_eq!(font_checksum(b"font"), "043901b8");
        assert_ne!(font_checksum(b"font-a"), font_checksum(b"font-b"));
    }
}
