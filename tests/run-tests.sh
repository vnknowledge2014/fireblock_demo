#!/bin/bash

# Script để chạy test API Fireblocks bằng curl

# Đảm bảo server đang chạy
echo "Đảm bảo server Fireblocks API đang chạy trên http://localhost:3000"
echo "Nếu chưa chạy, hãy mở terminal khác và chạy: bun run dev"
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
    curl -s http://localhost:3000/api/vault-accounts/0/XRP_TEST | jq
    
    echo "\n5. Test Get Supported Assets"
    curl -s http://localhost:3000/api/supported-assets | jq
    
    echo "\n6. Test Get Transactions"
    curl -s http://localhost:3000/api/transactions | jq

    echo "\n6. Test Get Specific Transaction"
    curl -s http://localhost:3000/api/transactions/376e73a3-3bae-4bae-bb2f-ac56fce740d0 | jq
}

run_curl_tests

echo "\nHoàn thành test!"