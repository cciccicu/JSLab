use std::io::{self, Write};

use tracing_appender::rolling;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt};

pub fn init() {
    let writer = move || PluginWriter(io::stdout());
    let console_layer = fmt::layer()
        .with_target(true)
        .with_ansi(true)
        .with_file(true)
        .with_line_number(true)
        .with_writer(writer)
        .compact();

    let file_appender = rolling::daily("logs", "app.log");
    let file_layer = fmt::layer()
        .with_target(true)
        .with_ansi(false)
        .with_file(true)
        .with_line_number(true)
        .with_writer(file_appender)
        .compact();

    // 注册所有 layer
    tracing_subscriber::registry()
        .with(console_layer)
        .with(file_layer)
        .init();
}

struct PluginWriter<W: Write>(W);

impl<W: Write> Write for PluginWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0.write_all(b"[Plugin] ")?;
        self.0.write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}
