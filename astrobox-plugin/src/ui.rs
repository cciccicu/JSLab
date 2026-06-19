use astrobox_ng_wit::astrobox::psys_host::{self, ui};
use std::sync::{Mutex, OnceLock};

// 表示手表上 JS 文件的结构体
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct WatchFile {
    pub name: String,
    pub size: String,
}

// 插件的 UI 状态结构体
#[derive(Clone)]
pub struct UiState {
    pub device_addr: Option<String>,
    pub watch_files: Vec<WatchFile>,
    pub pc_files: Vec<String>,
    pub logs: Vec<String>,
    pub root_element_id: Option<String>,
}

static UI_STATE: OnceLock<Mutex<UiState>> = OnceLock::new();

// 获取全局唯一的 UI 状态引用
pub fn ui_state() -> &'static Mutex<UiState> {
    UI_STATE.get_or_init(|| {
        Mutex::new(UiState {
            device_addr: None,
            watch_files: Vec::new(),
            pc_files: get_pc_files(),
            logs: vec!["[系统] 插件已启动。".to_string()],
            root_element_id: None,
        })
    })
}

// 获取 PC 工作区下的所有 .js 文件
pub fn get_pc_files() -> Vec<String> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(".") {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if ext == "js" {
                            if let Some(name) = path.file_name() {
                                if let Some(name_str) = name.to_str() {
                                    files.push(name_str.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    files
}

// 添加一条日志信息并限制最多保留 8 条
pub fn add_log(msg: &str) {
    let mut state = ui_state().lock().unwrap_or_else(|p| p.into_inner());
    state.logs.push(msg.to_string());
    if state.logs.len() > 8 {
        state.logs.remove(0);
    }
}

// 触发 UI 重新渲染
pub fn refresh_ui() {
    let (root_id, state_copy) = {
        let state = ui_state().lock().unwrap_or_else(|p| p.into_inner());
        (state.root_element_id.clone(), state.clone())
    };
    if let Some(root_id) = root_id {
        psys_host::ui::render(&root_id, build_ui(&state_copy));
    }
}

// 构建插件的功能主页面 UI
pub fn build_ui(state: &UiState) -> ui::Element {
    let status_text = match &state.device_addr {
        Some(addr) => format!("连接状态: 已连接至手表 ({})", addr),
        None => "连接状态: 未连接。请在手表上打开 JSLab 并刷新。".to_string(),
    };
    
    // 1. 顶部标题栏
    let title_bar = ui::Element::new(ui::ElementType::Div, None)
        .flex()
        .flex_direction(ui::FlexDirection::Column)
        .bg("#1e1e1e")
        .radius(6)
        .padding(12)
        .margin_bottom(12)
        .child(
            ui::Element::new(ui::ElementType::P, Some("JSLab 智能手表脚本管理器")).size(24)
        )
        .child(
            ui::Element::new(ui::ElementType::P, Some(status_text.as_str())).size(14).text_color("#aaaaaa")
        );

    // 2. 双栏区域 (手表端文件列表 + PC端工作区文件列表)
    // 左栏: 手表端文件列表
    let mut watch_col = ui::Element::new(ui::ElementType::Div, None)
        .flex()
        .flex_direction(ui::FlexDirection::Column)
        .padding(10)
        .bg("#1a1a1a")
        .radius(6)
        .margin_right(10)
        .width(360)
        .child(
            ui::Element::new(ui::ElementType::P, Some("手表上的 JS 脚本")).size(18).text_color("#ffffff").margin_bottom(8)
        );

    if state.watch_files.is_empty() {
        watch_col = watch_col.child(
            ui::Element::new(ui::ElementType::P, Some("（无文件，或尚未获取。点击“刷新手表”获取）")).size(14).text_color("#777777")
        );
    } else {
        for file in &state.watch_files {
            let file_row = ui::Element::new(ui::ElementType::Div, None)
                .flex()
                .flex_direction(ui::FlexDirection::Row)
                .align_center()
                .padding_top(6)
                .padding_bottom(6)
                .border(1, "#333333")
                .child(
                    ui::Element::new(ui::ElementType::P, Some(file.name.as_str())).size(15).text_color("#ffffff").width(180)
                )
                .child(
                    ui::Element::new(ui::ElementType::P, Some(&format!("{} B", file.size))).size(12).text_color("#888888").width(60)
                )
                .child(
                    ui::Element::new(ui::ElementType::Button, Some("下载"))
                        .bg("#2e7d32")
                        .radius(4)
                        .margin_right(5)
                        .on(ui::Event::Click, &format!("download:{}", file.name))
                )
                .child(
                    ui::Element::new(ui::ElementType::Button, Some("删除"))
                        .bg("#c62828")
                        .radius(4)
                        .on(ui::Event::Click, &format!("delete:{}", file.name))
                );
            watch_col = watch_col.child(file_row);
        }
    }

    // 右栏: PC 端工作区文件列表
    let mut pc_col = ui::Element::new(ui::ElementType::Div, None)
        .flex()
        .flex_direction(ui::FlexDirection::Column)
        .padding(10)
        .bg("#1a1a1a")
        .radius(6)
        .width(360)
        .child(
            ui::Element::new(ui::ElementType::P, Some("PC 工作区 JS 文件")).size(18).text_color("#ffffff").margin_bottom(8)
        );

    if state.pc_files.is_empty() {
        pc_col = pc_col.child(
            ui::Element::new(ui::ElementType::P, Some("（工作区内没有找到 .js 文件）")).size(14).text_color("#777777")
        );
    } else {
        for file in &state.pc_files {
            let file_row = ui::Element::new(ui::ElementType::Div, None)
                .flex()
                .flex_direction(ui::FlexDirection::Row)
                .align_center()
                .padding_top(6)
                .padding_bottom(6)
                .border(1, "#333333")
                .child(
                    ui::Element::new(ui::ElementType::P, Some(file.as_str())).size(15).text_color("#ffffff").width(220)
                )
                .child(
                    ui::Element::new(ui::ElementType::Button, Some("上传至手表"))
                        .bg("#1565c0")
                        .radius(4)
                        .on(ui::Event::Click, &format!("upload:{}", file))
                );
            pc_col = pc_col.child(file_row);
        }
    }

    let cols_row = ui::Element::new(ui::ElementType::Div, None)
        .flex()
        .flex_direction(ui::FlexDirection::Row)
        .margin_bottom(12)
        .child(watch_col)
        .child(pc_col);

    // 3. 操作按钮区
    let controls_row = ui::Element::new(ui::ElementType::Div, None)
        .flex()
        .flex_direction(ui::FlexDirection::Row)
        .margin_bottom(12)
        .child(
            ui::Element::new(ui::ElementType::Button, Some("刷新手表文件"))
                .bg("#37474f")
                .radius(6)
                .margin_right(10)
                .on(ui::Event::Click, "refresh_watch")
        )
        .child(
            ui::Element::new(ui::ElementType::Button, Some("刷新 PC 工作区"))
                .bg("#37474f")
                .radius(6)
                .on(ui::Event::Click, "refresh_pc")
        );

    // 4. 底栏操作日志区
    let mut logs_col = ui::Element::new(ui::ElementType::Div, None)
        .flex()
        .flex_direction(ui::FlexDirection::Column)
        .bg("#111111")
        .radius(6)
        .padding(10)
        .child(
            ui::Element::new(ui::ElementType::P, Some("操作日志与状态")).size(16).text_color("#888888").margin_bottom(6)
        );

    for log in &state.logs {
        logs_col = logs_col.child(
            ui::Element::new(ui::ElementType::P, Some(log.as_str())).size(13).text_color("#4caf50")
        );
    }

    // 合并并返回根容器
    ui::Element::new(ui::ElementType::Div, None)
        .flex()
        .flex_direction(ui::FlexDirection::Column)
        .padding(15)
        .width_full()
        .child(title_bar)
        .child(cols_row)
        .child(controls_row)
        .child(logs_col)
}

// 主渲染函数
pub fn render_main_ui(element_id: &str) {
    let state_copy = {
        let mut state = ui_state().lock().unwrap_or_else(|p| p.into_inner());
        state.root_element_id = Some(element_id.to_string());
        state.clone()
    };
    psys_host::ui::render(element_id, build_ui(&state_copy));
}

// 按钮点击等 UI 事件处理器
pub fn ui_event_processor(evtype: ui::Event, event_id: &str) {
    match evtype {
        ui::Event::Click => {
            if event_id.starts_with("download:") {
                let filename = event_id.trim_start_matches("download:").to_string();
                trigger_download(&filename);
            } else if event_id.starts_with("delete:") {
                let filename = event_id.trim_start_matches("delete:").to_string();
                trigger_delete(&filename);
            } else if event_id.starts_with("upload:") {
                let filename = event_id.trim_start_matches("upload:").to_string();
                trigger_upload(&filename);
            } else if event_id == "refresh_watch" {
                trigger_refresh_watch();
            } else if event_id == "refresh_pc" {
                trigger_refresh_pc();
            }
        }
        _ => {}
    }
}

// 接收和处理来自手表的互联通信响应
pub fn handle_interconnect_message(payload: String) {
    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&payload) {
        if let Some(action) = msg.get("action").and_then(|v| v.as_str()) {
            match action {
                "list_res" => {
                    let success = msg.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                    if success {
                        if let Some(files_arr) = msg.get("files").and_then(|v| v.as_array()) {
                            let mut watch_files = Vec::new();
                            for f_val in files_arr {
                                if let (Some(name), Some(size)) = (
                                    f_val.get("name").and_then(|v| v.as_str()),
                                    f_val.get("size").and_then(|v| v.as_str()),
                                ) {
                                    watch_files.push(WatchFile {
                                        name: name.to_string(),
                                        size: size.to_string(),
                                    });
                                }
                            }
                            {
                                let mut state = ui_state().lock().unwrap_or_else(|p| p.into_inner());
                                state.watch_files = watch_files;
                            }
                            add_log("[手表] 成功获取手表脚本列表。");
                        }
                    } else {
                        let err = msg.get("error").and_then(|v| v.as_str()).unwrap_or("未知错误");
                        add_log(&format!("[手表] 获取列表失败: {}", err));
                    }
                    refresh_ui();
                }
                "get_res" => {
                    let success = msg.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                    let name = msg.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    if success {
                        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        match std::fs::write(name, content) {
                            Ok(_) => {
                                add_log(&format!("[PC] 脚本 {} 已成功下载到本地工作区。", name));
                                {
                                    let mut state = ui_state().lock().unwrap_or_else(|p| p.into_inner());
                                    state.pc_files = get_pc_files();
                                }
                            }
                            Err(e) => {
                                add_log(&format!("[PC] 保存本地文件失败: {}", e));
                            }
                        }
                    } else {
                        let err = msg.get("error").and_then(|v| v.as_str()).unwrap_or("未知错误");
                        add_log(&format!("[手表] 下载失败 ({}): {}", name, err));
                    }
                    refresh_ui();
                }
                "save_res" => {
                    let success = msg.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                    let name = msg.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    if success {
                        add_log(&format!("[手表] 脚本 {} 已成功上传/保存到手表。", name));
                        // 自动重新获取手表文件列表
                        trigger_refresh_watch();
                    } else {
                        let err = msg.get("error").and_then(|v| v.as_str()).unwrap_or("未知错误");
                        add_log(&format!("[手表] 上传失败 ({}): {}", name, err));
                        refresh_ui();
                    }
                }
                "delete_res" => {
                    let success = msg.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                    let name = msg.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    if success {
                        add_log(&format!("[手表] 脚本 {} 已从手表端删除。", name));
                        // 自动重新获取手表文件列表
                        trigger_refresh_watch();
                    } else {
                        let err = msg.get("error").and_then(|v| v.as_str()).unwrap_or("未知错误");
                        add_log(&format!("[手表] 删除失败 ({}): {}", name, err));
                        refresh_ui();
                    }
                }
                _ => {}
            }
        }
    }
}

// 刷新手表文件列表
pub fn trigger_refresh_watch() {
    let device_addr = {
        let state = ui_state().lock().unwrap_or_else(|p| p.into_inner());
        state.device_addr.clone()
    };
    if let Some(addr) = device_addr {
        astrobox_ng_wit::spawn(async move {
            let req = serde_json::json!({
                "action": "list"
            });
            let _ = psys_host::interconnect::send_qaic_message(&addr, "icu.ccicc.jslab", &req.to_string()).await;
        });
    } else {
        add_log("[系统] 错误: 未连接到设备。");
        refresh_ui();
    }
}

// 刷新 PC 工作区文件列表
fn trigger_refresh_pc() {
    {
        let mut state = ui_state().lock().unwrap_or_else(|p| p.into_inner());
        state.pc_files = get_pc_files();
    }
    add_log("[PC] 本地文件列表已刷新。");
    refresh_ui();
}

// 请求下载指定的 JS 文件到本地
fn trigger_download(filename: &str) {
    let device_addr = {
        let state = ui_state().lock().unwrap_or_else(|p| p.into_inner());
        state.device_addr.clone()
    };
    if let Some(addr) = device_addr {
        let filename = filename.to_string();
        add_log(&format!("[手表] 正在请求下载 {}...", filename));
        refresh_ui();
        astrobox_ng_wit::spawn(async move {
            let req = serde_json::json!({
                "action": "get",
                "name": filename
            });
            let _ = psys_host::interconnect::send_qaic_message(&addr, "icu.ccicc.jslab", &req.to_string()).await;
        });
    } else {
        add_log("[系统] 错误: 未连接到设备。");
        refresh_ui();
    }
}

// 请求从手表中删除指定的 JS 文件
fn trigger_delete(filename: &str) {
    let device_addr = {
        let state = ui_state().lock().unwrap_or_else(|p| p.into_inner());
        state.device_addr.clone()
    };
    if let Some(addr) = device_addr {
        let filename = filename.to_string();
        add_log(&format!("[手表] 正在请求删除 {}...", filename));
        refresh_ui();
        astrobox_ng_wit::spawn(async move {
            let req = serde_json::json!({
                "action": "delete",
                "name": filename
            });
            let _ = psys_host::interconnect::send_qaic_message(&addr, "icu.ccicc.jslab", &req.to_string()).await;
        });
    } else {
        add_log("[系统] 错误: 未连接到设备。");
        refresh_ui();
    }
}

// 上传本地工作区 JS 文件到手表
fn trigger_upload(filename: &str) {
    let device_addr = {
        let state = ui_state().lock().unwrap_or_else(|p| p.into_inner());
        state.device_addr.clone()
    };
    if let Some(addr) = device_addr {
        let filename = filename.to_string();
        add_log(&format!("[PC] 正在读取并上传 {}...", filename));
        refresh_ui();
        astrobox_ng_wit::spawn(async move {
            match std::fs::read_to_string(&filename) {
                Ok(content) => {
                    let req = serde_json::json!({
                        "action": "save",
                        "name": filename,
                        "content": content
                    });
                    let _ = psys_host::interconnect::send_qaic_message(&addr, "icu.ccicc.jslab", &req.to_string()).await;
                }
                Err(e) => {
                    add_log(&format!("[PC] 读取本地文件 {} 失败: {}", filename, e));
                    refresh_ui();
                }
            }
        });
    } else {
        add_log("[系统] 错误: 未连接到设备。");
        refresh_ui();
    }
}
