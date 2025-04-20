# Hướng dẫn Test API Fireblocks

Thư mục này chứa các file cần thiết để test API Fireblocks bằng Postman/Newman và curl.

## Cấu trúc thư mục

- `fireblocks-api.postman_collection.json`: Collection Postman chứa các request test cho tất cả các API
- `fireblocks-api.postman_environment.json`: File môi trường Postman chứa các biến cần thiết
- `run-tests.sh`: Script bash để chạy test bằng Newman hoặc curl

## Yêu cầu

- Node.js và npm đã được cài đặt
- Newman (có thể cài đặt bằng lệnh `npm install -g newman`)
- jq (để hiển thị kết quả JSON từ curl một cách đẹp hơn)
- Server Fireblocks API đang chạy trên http://localhost:3000

## Cách sử dụng

### Sử dụng script tự động

1. Đảm bảo server API đang chạy:
   ```
   npm run dev
   ```

2. Cấp quyền thực thi cho script:
   ```
   chmod +x ./tests/run-tests.sh
   ```

3. Chạy script test:
   ```
   ./tests/run-tests.sh
   ```

4. Chọn phương thức test mong muốn:
   - 1: Chạy test bằng curl
   - 2: Chạy test bằng Newman
   - 3: Chạy cả hai phương thức

### Sử dụng Postman trực tiếp

1. Import file collection và environment vào Postman
2. Chọn environment "Fireblocks API Environment"
3. Chạy các request trong collection

### Sử dụng Newman trực tiếp

```
newman run ./tests/fireblocks-api.postman_collection.json -e ./tests/fireblocks-api.postman_environment.json
```

### Sử dụng curl trực tiếp

```bash
# Root Endpoint
curl -s http://localhost:3000/ | jq

# Get Vault Accounts
curl -s http://localhost:3000/api/vault-accounts | jq

# Get Vault Account by ID
curl -s http://localhost:3000/api/vault-accounts/0 | jq

# Get Vault Assets
curl -s http://localhost:3000/api/vault-accounts/0/assets | jq

# Get Supported Assets
curl -s http://localhost:3000/api/supported-assets | jq

# Get Transactions
curl -s http://localhost:3000/api/transactions | jq
```

## Cập nhật biến môi trường

Nếu cần thay đổi URL server hoặc ID vault account, bạn có thể cập nhật các giá trị trong file `fireblocks-api.postman_environment.json`.