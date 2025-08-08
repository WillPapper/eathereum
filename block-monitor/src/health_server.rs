use eyre::Result;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tracing::info;

pub struct HealthServer {
    port: String,
}

impl HealthServer {
    pub fn new(port: String) -> Self {
        Self { port }
    }

    pub async fn start(&self) -> Result<()> {
        let addr = format!("0.0.0.0:{}", self.port);
        let listener = TcpListener::bind(&addr).await?;
        info!("Health check server listening on: {}", addr);

        loop {
            let (mut stream, _) = listener.accept().await?;

            tokio::spawn(async move {
                let response = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK";
                let _ = stream.write_all(response.as_bytes()).await;
            });
        }
    }
}
