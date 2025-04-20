/**
 * Script JavaScript để chạy test API Fireblocks bằng Newman
 * 
 * Cách sử dụng:
 * 1. Cài đặt dependencies: npm install newman
 * 2. Chạy script: node run-newman.js
 */

const newman = require('newman');
const path = require('path');

// Đường dẫn đến collection và environment
const collectionPath = path.join(__dirname, 'fireblocks-api.postman_collection.json');
const environmentPath = path.join(__dirname, 'fireblocks-api.postman_environment.json');

console.log('Bắt đầu chạy test API Fireblocks bằng Newman...');
console.log('Đảm bảo server API đang chạy trên http://localhost:3000');

// Chạy collection với Newman
newman.run({
  collection: require(collectionPath),
  environment: require(environmentPath),
  reporters: ['cli'],
  reporter: {
    cli: {
      noSummary: false,
      noFailures: false
    }
  }
}, function (err, summary) {
  if (err) { 
    console.error('Lỗi khi chạy Newman:', err);
    process.exit(1);
  }
  
  // Kiểm tra kết quả test
  const failedTests = summary.run.failures.length;
  console.log(`\nKết quả: ${summary.run.stats.assertions.total} test, ${failedTests} thất bại`);
  
  if (failedTests > 0) {
    console.log('\nCác test thất bại:');
    summary.run.failures.forEach((failure, index) => {
      console.log(`${index + 1}. ${failure.error.test}: ${failure.error.message}`);
    });
    process.exit(1);
  } else {
    console.log('\nTất cả các test đều thành công!');
  }
});