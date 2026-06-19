use astrobox_ng_wit::FutureReader;

use astrobox_ng_wit::exports::astrobox::psys_plugin::{
    event::{self, EventType},
    lifecycle,
};
use astrobox_ng_wit::astrobox::psys_host;

pub mod logger;
pub mod ui;
pub mod resources;

struct JSLabPlugin;

impl event::Guest for JSLabPlugin {
    #[allow(async_fn_in_trait)]
    fn on_event(event_type: EventType, event_payload: String) -> FutureReader<String> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<String>(|| "".to_string());

        match event_type {
            // 接收并处理手表端的 interconnect 互联消息
            EventType::InterconnectMessage => {
                ui::handle_interconnect_message(event_payload);
            }
            _ => {}
        };

        astrobox_ng_wit::spawn(async move {
            let _ = writer.write("".to_string()).await;
        });

        reader
    }

    fn on_ui_event(
        event_id: String,
        event: event::Event,
        _event_payload: String,
    ) -> astrobox_ng_wit::FutureReader<String> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<String>(|| "".to_string());

        // 转发 UI 事件给处理器
        ui::ui_event_processor(event, &event_id);

        astrobox_ng_wit::spawn(async move {
            let _ = writer.write("".to_string()).await;
        });

        reader
    }

    fn on_ui_render(element_id: String) -> astrobox_ng_wit::FutureReader<()> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<()>(|| ());

        // 渲染主 UI 页面
        ui::render_main_ui(&element_id);

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

impl lifecycle::Guest for JSLabPlugin {
    #[allow(async_fn_in_trait)]
    fn on_load() -> () {
        logger::init();
        tracing::info!("JSLab Watch Manager Plugin Loaded!");

        // 启动后台任务：发现已连接的设备并自动注册互联消息接收器
        astrobox_ng_wit::spawn(async move {
            let devices = psys_host::device::get_connected_device_list().await;
            tracing::info!("Discovered devices: {:?}", devices);
            if let Some(d) = devices.first() {
                // 为找到的第一个连接设备注册 interconnect 消息接收器
                let reg_res = psys_host::register::register_interconnect_recv(&d.addr, "icu.ccicc.jslab").await;
                tracing::info!("Interconnect registration result: {:?}", reg_res);

                {
                    let mut state = ui::ui_state().lock().unwrap_or_else(|p| p.into_inner());
                    state.device_addr = Some(d.addr.clone());
                    state.logs.push(format!("[系统] 已发现设备: {} ({})", d.name, d.addr));
                }

                // 自动执行一次获取手表文件列表的请求
                ui::trigger_refresh_watch();
            } else {
                ui::add_log("[系统] 未找到任何连接的手表设备。请保持设备连接并刷新。");
                ui::refresh_ui();
            }
        });
    }
}

astrobox_ng_wit::export!(JSLabPlugin);
