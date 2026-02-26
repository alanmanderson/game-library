/**
 * Server connection config.
 *
 * For Android emulator:  use 10.0.2.2 (alias for host machine's localhost)
 * For physical device:   set DEV_HOST to your machine's LAN IP
 * For production:        set to your server's public URL
 */
const DEV_HOST = "10.0.2.2";
const DEV_PORT = "8000";

export const API_BASE = `http://${DEV_HOST}:${DEV_PORT}`;
export const WS_BASE = `ws://${DEV_HOST}:${DEV_PORT}`;
export const IMAGE_BASE = `http://${DEV_HOST}:${DEV_PORT}`;
