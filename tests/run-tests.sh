#!/bin/bash

# Script để chạy test API Fireblocks bằng Newman và curl

# Kiểm tra xem Newman đã được cài đặt chưa
if ! command -v newman &> /dev/null; then
    echo "Newman chưa được cài đặt. Đang cài đặt..."
    npm install -g newman
fi

# Đảm bảo server đang chạy
echo "Đảm bảo server Fireblocks API đang chạy trên http://localhost:3000"
echo "Nếu chưa chạy, hãy mở terminal khác và chạy: npm run dev"
echo ""

# Hàm để chạy test bằng curl
run_curl_tests() {
    echo "===== CHẠY TEST BẰNG CURL ====="
    
    echo "\n1. Test Root Endpoint"
    curl -s http://localhost:3000/ | jq
    
    echo "\n2. Test Get Vault Accounts"
    curl -s http://localhost:3000/api/vault-accounts | jq
    
    echo "\n3. Test Get Vault Account by ID (ID=0)"
    curl -s http://localhost:3000/api/vault-accounts/0 | jq
    
    echo "\n4. Test Get Vault Assets (ID=0)"
    curl -s http://localhost:3000/api/vault-accounts/0/assets | jq
    
    echo "\n5. Test Get Supported Assets"
    curl -s http://localhost:3000/api/supported-assets | jq
    
    echo "\n6. Test Get Transactions"
    curl -s http://localhost:3000/api/transactions | jq
}

# Hàm để chạy test bằng Newman
run_newman_tests() {
    echo "\n===== CHẠY TEST BẰNG NEWMAN ====="
    newman run ./tests/fireblocks-api.postman_collection.json -e ./tests/fireblocks-api.postman_environment.json
}

# Menu lựa chọn
echo "Chọn phương thức test:"
echo "1. Chạy test bằng curl"
echo "2. Chạy test bằng Newman"
echo "3. Chạy cả hai phương thức"
read -p "Lựa chọn của bạn (1-3): " choice

case $choice in
    1)
        run_curl_tests
        ;;
    2)
        run_newman_tests
        ;;
    3)
        run_curl_tests
        run_newman_tests
        ;;
    *)
        echo "Lựa chọn không hợp lệ"
        exit 1
        ;;
esac

echo "\nHoàn thành test!"