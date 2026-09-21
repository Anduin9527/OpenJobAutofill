# OpenJobAutofill

[中文 README](README.md)

<p align="center">
  <img src="assets/openjobautofill-logo.png" alt="OpenJobAutofill" width="720" />
</p>

OpenJobAutofill is an AI-assisted browser extension for job application forms. You keep one resume profile locally, open a recruiting website, click `Start Filling`, and the extension scans the current page, uses local rules plus optional AI to understand field meanings, fills fields it can determine, and marks the rest as pending.

It is not designed to be a fully automated job-submission bot. Its goal is to use AI where it helps most: understanding messy field names and page structures across different recruiting websites, while keeping your actual resume values on your device. Personal information, education, internships, projects, certificates, awards, and other common resume fields can be filled first, then reviewed and submitted by you.

If this project saves you time, a GitHub Star would be appreciated. Issues and feedback also help improve compatibility with more recruiting sites.

## Highlights

- The settings page and popup use an Electric Studio theme with a bundled Manrope font for a clean, focused local-tool experience.
- One-click scanning for the current job application page: determined fields are filled, and the rest are marked as pending.
- Resume data stays on your device and does not need to be uploaded to a cloud service.
- Supports common inputs, textareas, radio buttons, checkboxes, dropdowns, and date-like fields.
- Includes a reusable control-adapter layer for native controls, Layui (including hidden `select` plus `dd[lay-value]` proxy dropdowns), Ant Design, Element UI, Arco Design, and TDesign; control adapters are kept separate from site adapters.
- The profile panel follows the Electric Studio theme, and each saved field supports one-click copy plus direct edit-and-save from the page.
- Optional OpenAI-compatible API or custom API support for better page-field understanding.
- AI only helps identify page fields and matching profile-field names, not your actual resume values.
- Autofill results use two color marks: green for filled fields and orange for fields that still need attention.

## Installation

The current version is intended to be installed in Brave or Chrome through developer mode.

1. Download or clone this repository to your computer.
2. Open `brave://extensions/` or `chrome://extensions/`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the `OpenJobAutofill` project folder.
6. Pin the extension icon for easier access on job application pages.

No dependency installation or build step is required. Load the project folder directly.

## Keeping Two Computers on the Same Version

If you do not use the Chrome Web Store, both computers can update from the same GitHub `main` branch. The extension code will stay aligned, while resume profiles, API settings, backup history, and debug logs remain separate in each browser's `chrome.storage.local`; the updater scripts do not synchronize that data.

One-time setup:

1. Use `git clone` for this repository on both computers instead of downloading only a ZIP archive.
2. On each computer, load the unpacked extension from its cloned `OpenJobAutofill` directory.
3. Make, commit, and push future changes to `origin/main` from the primary development computer.

To update the other computer:

- macOS: double-click [`scripts/Update-OpenJobAutofill.command`](scripts/Update-OpenJobAutofill.command).
- Windows: double-click [`scripts/Update-OpenJobAutofill.cmd`](scripts/Update-OpenJobAutofill.cmd). The launcher runs the PowerShell updater in the same directory.

The updater verifies the branch and worktree, then runs only `git pull --ff-only origin main`. If it finds modified or untracked files, it stops and lists them without overwriting, deleting, or stashing anything. After a successful update, it displays the extension version and opens the extension management page for Chrome, Brave, or Edge.

Finally, find OpenJobAutofill on the extension management page, click `Reload`, and refresh the job application page. Do not remove and reinstall the extension or load it from a different folder just to upgrade; reloading the existing extension card preserves that computer's local profile data.

## First Use

1. Click the OpenJobAutofill icon in the browser toolbar.
2. Click `Settings`.
3. Fill in your resume profile by section.
4. Click `Save Profile`; the data is saved to local browser extension storage.
5. Open a resume or application form page on a recruiting website.
6. Click the extension icon, then click `Start Filling`.
7. Wait for scanning and filling to complete, then review the green/orange marks on the page.
8. For orange pending fields, open the profile panel, search the value, then copy it with one click or edit and save it directly.
9. Review the final form yourself and submit it manually.

The repository includes `sample-profile.json` if you want to test the extension before entering your own data.

## AI Settings

AI is optional. If no API is configured, OpenJobAutofill still uses local rules to match and fill fields.

If you want better understanding of different recruiting websites, configure your own API in the settings page. OpenAI-compatible endpoints, custom Base URLs, endpoint paths, and model names are supported. `Test API Connection` only checks the current form values; click `Save API Settings` before using them for filling. `Refresh Model Suggestions` only updates model suggestions, and model names can still be entered manually.

The privacy boundary is explicit: AI requests contain the current page fields and local profile-field names only. They do not include your name, phone number, ID number, resume content, or other actual profile values. Value lookup and form filling happen locally in the browser.

## Color Marks

- Green: filled.
- Orange: pending manual handling or review.

If the page refreshes, moves to another step, or dynamically loads new fields, click `Start Filling` again.

## Privacy

- Resume data is stored locally in your browser.
- API keys are stored only in local extension storage.
- Page scripts are injected only after you click the extension and interact with the current page.
- The extension never clicks the final submit button automatically.
- The extension never sends your actual resume values to AI.
- Always review the page after autofill, especially IDs, contact information, dates, choice fields, and declaration fields.

## FAQ

### Nothing happens after clicking Start Filling

Refresh the target page and open the extension popup again. If it still does not respond, reload OpenJobAutofill from the browser extension management page.

### Why do some dropdowns or date fields become pending?

Recruiting systems implement controls in many different ways. The extension now tries a control adapter first; for Layui it links the hidden native `select` to the visible proxy dropdown and waits for asynchronous options. Other unsupported custom controls may still be marked as pending, in which case you can search and copy the value manually. If the same website or control type often needs manual handling, please open an Issue so it can be investigated.

### How do multi-page forms work?

Click `Start Filling` again after moving to a new page or step. OpenJobAutofill does not automatically continue across pages and does not submit applications.

### How do I back up or migrate my profile?

Every profile save creates a deduplicated in-browser history version. The latest 10 versions are available from `Profile Backup Safety` in settings.

For protection against extension removal, enable `Automatically back up to Downloads`. The browser requests the downloads permission only when you enable it. Later saves write the newest profile for the day to `OpenJobAutofill/backups/` under Downloads. These files survive extension removal, but they contain personal resume information and should only be kept on a trusted device.

You can also use `Save Another Backup` for a timestamped JSON file, or `Import Profile Backup` to restore one. Profile backups do not contain API keys or other API configuration.

### How do I clear local data?

Open the settings page and click `Clear Profile and API Settings`. This removes the saved resume profile, API configuration, and in-browser version history. Previously downloaded backup files are not deleted.

## Feedback

If you run into a problem, want support for a specific recruiting website, or have a feature request, please open an Issue. Including the website name, screenshots, and pending-field descriptions will make the issue easier to reproduce.

You can also check my GitHub profile for a public email address.

Community link: [LINUX DO](https://linux.do) - A Chinese community for tech enthusiasts. This project links to and recognizes LINUX DO for discussion and feedback.

## License

OpenJobAutofill is open-sourced under the MIT License. See [LICENSE](LICENSE) for details.
