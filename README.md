# Fireblocks Demo API

Ứng dụng demo API kết nối với Fireblocks để lấy thông tin ví và các tính năng khác mà Fireblocks hỗ trợ.

## Công nghệ sử dụng

- TypeScript
- BunJS
- HonoJS
- Docker & Docker Compose

## Cài đặt và chạy ứng dụng

### Phương pháp 1: Sử dụng Bun trực tiếp

1. Cài đặt các dependencies:

```bash
bun install
```

2. Chạy ứng dụng ở chế độ development:

```bash
bun run dev
```

### Phương pháp 2: Sử dụng Docker

1. Build và chạy container với Docker Compose:

```bash
docker-compose up -d
```

## API Endpoints

- `GET /`: Trang chủ API
- `GET /api/vault-accounts`: Lấy danh sách tất cả các tài khoản vault
- `GET /api/vault-accounts/:vaultAccountId`: Lấy thông tin chi tiết của một tài khoản vault
- `GET /api/vault-accounts/:vaultAccountId/assets`: Lấy danh sách tài sản trong một tài khoản vault
- `GET /api/supported-assets`: Lấy danh sách tài sản được hỗ trợ
- `GET /api/transactions`: Lấy danh sách các giao dịch

## Biến môi trường

Ứng dụng sử dụng các biến môi trường sau:

- `FIREBLOCKS_API_KEY`: API key của Fireblocks
- `FIREBLOCKS_API_SECRET_PATH`: Đường dẫn đến file khóa bí mật của Fireblocks

## Lưu ý

- Đảm bảo file `fireblocks_secret.key` được đặt đúng vị trí như trong biến môi trường
- Đảm bảo API key của Fireblocks có đủ quyền để truy cập các tính năng cần thiết