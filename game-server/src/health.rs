use tracing::info;
use warp::Filter;

pub async fn start_health_server(port: u16) {
    let health = warp::path("health")
        .map(|| warp::reply::with_status("OK", warp::http::StatusCode::OK));

    info!("Health check server starting on port {}", port);
    warp::serve(health).run(([0, 0, 0, 0], port)).await;
}