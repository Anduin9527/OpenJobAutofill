# SD 选项识别：1.2.7

1.2.6 的真实执行日志：72 项中 38 项为原值已匹配；34 项失败。失败下拉的阶段没有 clicked，不能再把问题归因于点击后的清理。

2026-09-29 经用户手动展开就读年份后，从真实页面读取到：

```html
<div class="sd-Dropdown-dropdown-GmACl">
  <div class="sd-Select-menu-36GwS">
    <div class="sd-Select-scrollable-6CVW5">
      <div class="sd-Menu-container-1WISQ">
        <div class="sd-Menu-content-bDquM sd-Menu-leftItem-1MDIB">
          <div class="sd-Menu-content-item-3BOO1">
            <span data-key="sugar.select.label">2126</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

年份没有学历菜单的 `sd-Select-common-item` 包装；旧选择器因此读不到任何选项。修正：同时支持 Menu 行和 common-item 包装，由现有运行时去重并保持当前浮层范围。

真实页面输入通用搜索词后，学校、专业才出现异步候选，结构为 common-item 包裹 Menu 行。搜索词已清空，未选中或提交真实资料。修正：允许没有浮层时先输入搜索词，再等待属于当前字段的菜单，不提前返回失败。

另修正 SD 数值按字面匹配：原通用布尔归一化会把月份 1 变成“是”；批量末尾复核也改为字面值。

验证范围：从真实页面读取菜单结构与搜索响应；本地用例覆盖该结构、月份 1、学校与专业的异步搜索。插件在真实页面的端到端验收尚未完成，不能将本地用例通过称为线上问题已解决。
