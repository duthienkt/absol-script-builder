# Build 1 trang web từ css, html, javascript sang php

## Bước 1: Tạo file chứa thông tin dạng *Json*

Ví dụ : ***setting.build.json***

```json
{
    "title": "Sableye builder",
    "description": "Auto translate from js/css to php",
    "items": [{
        "type": "css",
        "input": "css_modules/menu/navigation_collapse.css",
        "output": "build/res/navigation_collapse_css.php",
        "id": "css.menu.navigation_collapse"
    }, {
        "type": "php",
        "input": "php_modules/html/html_content.php",
        "output": "build/res/html_content.php"
    }, {
        "type": "css",
        "input": "css_modules/calendar/calendar_default.css",
        "output": "build/res/calendar_default_css.php",
        "id": "css.calendar_default"
    }, {
        "type": "js",
        "input": "javascript_modules/ui/ui.common.js",
        "output": "build/res/ui_common_js.php",
        "id": "js.ui.common"
    }
}

```

Các định dạng hỗ trợ tương ứng với type bao gồm css, js(javascript), txt và html ,php và raw(chỉ copy).


## Bước 2 : tạo script để chạy build 

```javascript
var grov = require("grov");
var builder = grov.createBuilder("setting.build.json", 3000);
```

Trong đó 3000 là thời gian cập nhật