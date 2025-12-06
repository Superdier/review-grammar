# Grammar Review App

Đây là một ứng dụng web đơn giản để học và ôn tập ngữ pháp tiếng Nhật.

## Tính năng

*   **Quản lý dữ liệu**: Thêm, sửa, xóa các cấu trúc ngữ pháp.
*   **Import/Export**: Nhập dữ liệu từ tệp Word (.docx) hoặc JSON, và xuất ra tệp JSON để sao lưu.
*   **Học nhanh (Quick Learn)**: Một quy trình học gồm 4 bước để học các mục ngữ pháp mới.
*   **Luyện tập**: Các chế độ luyện tập khác nhau như ghép cặp, trắc nghiệm và sắp xếp câu.
*   **Theo dõi tiến độ**: Lưu lại tiến độ học và thống kê trả lời đúng/sai.
*   **Đồng bộ đám mây**: Dữ liệu được đồng bộ với Firebase Firestore.

## Hướng dẫn Import dữ liệu từ JSON

Bạn có thể nhập một danh sách các cấu trúc ngữ pháp bằng cách sử dụng tệp JSON.

1.  Trên trang chủ, nhấn vào nút `+ Import & Manage Data` để mở khu vực quản lý.
2.  Nhấn vào nút `Import from JSON` và chọn tệp JSON của bạn.

### Cấu trúc tệp JSON mẫu

Tệp JSON phải là một mảng (array) các đối tượng (object), mỗi đối tượng đại diện cho một cấu trúc ngữ pháp. Dưới đây là một ví dụ:

```json
[
  {
    "id": "1",
    "structure": "～ことにする",
    "meaning": "Quyết định làm (không làm) gì đó",
    "explanation": "Dùng để thể hiện ý chủ động quyết định sẽ làm / không làm gì của người nói.",
    "examples": [
      { "jp": "明日からジョギングすることにしよう。", "vi": "Tôi quyết định sẽ bắt đầu chạy bộ từ ngày mai." },
      { "jp": "これからはあまり甘い物はたべないことにしよう。", "vi": "Từ giờ tôi quyết định sẽ không ăn nhiều đồ ngọt nữa." }
    ],
    "note": "Mẫu này thể hiện ý chí của người nói."
  }
]
```