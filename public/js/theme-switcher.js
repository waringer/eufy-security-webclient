// ========== Theme Switcher ==========
/**
 * Available theme options.
 * @type {string[]}
 */
const themes = ['dark', 'light'];

/**
 * Reference to the theme stylesheet link element.
 * @type {HTMLLinkElement|null}
 */
let themeLink = null;

/**
 * Reference to the theme toggle button element.
 * @type {HTMLButtonElement|null}
 */
let themeToggleBtn = null;

/**
 * Applies the specified theme by updating the CSS link and saving to localStorage.
 * Falls back to 'dark' theme if an invalid theme is provided.
 * @param {string} theme - The theme to apply ('dark' or 'light').
 */
function themeApply(theme) {
    if (!themes.includes(theme)) {
        theme = 'dark';
    }
    themeLink.href = `css/${theme}-theme.css`;
    localStorage.setItem('selectedTheme', theme);
    themeUpdateButton(theme);
}

/**
 * Updates the theme toggle button's icon and title based on the current theme.
 * @param {string} theme - The current theme ('dark' or 'light').
 */
function themeUpdateButton(theme) {
    themeToggleBtn.textContent = theme === 'light' ? '🌙' : '🔆';
    themeToggleBtn.title = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
}

/**
 * Toggles between dark and light themes.
 */
function themeToggle() {
    const currentTheme = localStorage.getItem('selectedTheme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    themeApply(nextTheme);
}

/**
 * Initializes the theme switcher by setting up references and event listeners.
 * Applies the saved theme from localStorage or defaults to 'dark'.
 */
function themeInit() {
    themeLink = document.getElementById('theme-link');
    themeToggleBtn = document.getElementById('theme-toggle-btn');

    themeApply(localStorage.getItem('selectedTheme') || 'dark');
    themeToggleBtn.addEventListener('click', themeToggle);
}
