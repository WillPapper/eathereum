use alloy::primitives::{address, Address};
use std::collections::HashMap;

pub const USDC_ADDRESS: Address = address!("833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
pub const USDT_ADDRESS: Address = address!("fde4C96c8593536E31F229EA8f37b2ADa2699bb2");
pub const DAI_ADDRESS: Address = address!("50c5725949A6F0c72E6C4a641F24049A917DB0Cb");

pub const POLLING_INTERVAL_SECS: u64 = 2;
pub const REDIS_MAX_RETRIES: u32 = 3;
pub const REDIS_STREAM_KEY: &str = "stablecoin:transactions";
pub const REDIS_STREAM_MAX_LEN: i64 = 10000;

#[derive(Clone)]
pub struct StablecoinInfo {
    pub name: &'static str,
    pub decimals: u8,
}

pub fn get_stablecoin_map() -> HashMap<Address, StablecoinInfo> {
    let mut stablecoins = HashMap::new();
    stablecoins.insert(
        USDC_ADDRESS,
        StablecoinInfo {
            name: "USDC",
            decimals: 6,
        },
    );
    stablecoins.insert(
        USDT_ADDRESS,
        StablecoinInfo {
            name: "USDT",
            decimals: 6,
        },
    );
    stablecoins.insert(
        DAI_ADDRESS,
        StablecoinInfo {
            name: "DAI",
            decimals: 18,
        },
    );
    stablecoins
}
