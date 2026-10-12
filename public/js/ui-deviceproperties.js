// Device property table
// Groups, labels, units and enum texts come from the server (meta.groups, built from the SDK's device.describe()),
// property names are the names of @mega-yfue/eufy-sdk. Properties starting with '$' are static device information.

// Default pinned groups (group labels)
const DEFAULT_PINNED_GROUPS = [
    "Device Information",
    "Battery",
];

const localStorageKeyPinnedGroups = 'eufyWebClientPinnedGroups';
const currentProperties = new Map();    // property name -> last value
const currentDefinitions = new Map();   // property name -> definition from meta

/**
 * Format a property value based on its definition
 */
function uiFormatPropertyValue(value, definition) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    // Helper to escape HTML special characters to prevent XSS
    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Helper function to format boolean values as icons
    const formatBool = (val) => {
        if (val === true) return '<span class="true">✓</span>';
        if (val === false) return '<span class="false">✗</span>';
        return '-';
    };

    // Enum with texts: show the text, keep the raw value in parentheses
    if (definition.labels && definition.labels[String(value)] !== undefined) {
        return `${escapeHtml(definition.labels[String(value)])} <span class="value-range">(${escapeHtml(value)})</span>`;
    }

    if (typeof value === "boolean") {
        return formatBool(value);
    }

    if (typeof value === "object") {
        return escapeHtml(JSON.stringify(value));
    }

    if (typeof value === "number") {
        let formatted = escapeHtml(value.toString());
        if (definition.unit) formatted += ` ${escapeHtml(definition.unit)}`;
        return formatted;
    }

    return escapeHtml(value.toString());
}

/**
 * Create collapsible property sections grouped by category
 * @param {string} containerId - Id of the container element
 * @param {Object} meta - Description from the server { groups: [{ id, label, properties: [...] }] }
 */
function uiCreatePropertyTable(containerId = "device-properties", meta = { groups: [] }) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id '${containerId}' not found`);
        return;
    }

    // Clear existing content
    container.innerHTML = "";
    currentDefinitions.clear();

    const headerElements = [];
    const pinnedGroups = JSON.parse(localStorage.getItem(localStorageKeyPinnedGroups)) || DEFAULT_PINNED_GROUPS;

    // Create sections for each group in the order the server sent them
    for (const group of meta.groups || []) {
        const groupName = group.label;
        const properties = group.properties || [];
        if (properties.length === 0) continue;

        // Create section element
        const section = document.createElement("div");
        section.className = "device-info-section";
        section.dataset.group = groupName;

        // Create header
        const header = document.createElement("div");
        header.className = "device-info-header";

        const h3 = document.createElement("h3");
        const pinIcon = document.createElement("span");
        pinIcon.className = "pin-icon";
        h3.appendChild(pinIcon);
        h3.appendChild(document.createTextNode(groupName));
        header.appendChild(h3);

        const chevron = document.createElement("span");
        chevron.className = "chevron";
        header.appendChild(chevron);

        // Create content container
        const content = document.createElement("div");
        content.className = "device-info-content";

        const grid = document.createElement("div");
        grid.className = "device-info-grid";

        // Add property items
        properties.forEach(prop => {
            currentDefinitions.set(prop.name, prop);

            const item = document.createElement("div");
            item.className = "device-info-item";
            item.dataset.property = prop.name;
            if (prop.description) item.title = prop.description;

            // Create elements safely without innerHTML to prevent XSS
            const labelSpan = document.createElement("span");
            labelSpan.className = "device-info-label";
            labelSpan.textContent = prop.label;

            const valueSpan = document.createElement("span");
            valueSpan.className = "device-info-value";
            valueSpan.textContent = "-";

            item.appendChild(labelSpan);
            item.appendChild(valueSpan);

            grid.appendChild(item);
        });

        content.appendChild(grid);
        section.appendChild(header);
        section.appendChild(content);
        container.appendChild(section);

        headerElements.push(header);
        header.uiOpen = (state) => {
            if (pinIcon.classList.contains("pinned")) {
                state = true; // Force open if pinned
            }

            if (!state) {
                content.classList.remove("open");
                header.querySelector(".chevron").classList.remove("open");
            } else {
                content.classList.add("open");
                header.querySelector(".chevron").classList.add("open");
            }
        }

        // Add click handler for collapsing/expanding
        header.addEventListener("click", () => {
            if (pinIcon.classList.contains("pinned")) return; // Do nothing if pinned
            const isOpen = content.classList.contains("open");

            headerElements.forEach(otherHeader => {
                if (otherHeader !== header) {
                    otherHeader.uiOpen(false);
                } else {
                    otherHeader.uiOpen(!isOpen);
                }
            });
        });

        pinIcon.addEventListener("click", (event) => {
            event.stopPropagation(); // Prevent triggering the collapse/expand
            pinIcon.classList.toggle("pinned");

            // If pinned, ensure the section is open
            if (pinIcon.classList.contains("pinned")) {
                let pinnedGroups = JSON.parse(localStorage.getItem(localStorageKeyPinnedGroups)) || DEFAULT_PINNED_GROUPS;
                pinnedGroups = pinnedGroups.filter(g => g !== groupName); // Remove if already exists
                pinnedGroups.push(groupName);
                localStorage.setItem(localStorageKeyPinnedGroups, JSON.stringify(pinnedGroups));
                header.uiOpen(true);
            } else {
                // If unpinned, collapse the section
                let pinnedGroups = JSON.parse(localStorage.getItem(localStorageKeyPinnedGroups)) || DEFAULT_PINNED_GROUPS;
                pinnedGroups = pinnedGroups.filter(g => g !== groupName);
                localStorage.setItem(localStorageKeyPinnedGroups, JSON.stringify(pinnedGroups));
                header.uiOpen(false);
            }
        });

        if (pinnedGroups.includes(groupName)) {
            pinIcon.click();
        }
    }
}

/**
 * Update device property values in the UI
 * Properties that are not part of the current table are ignored.
 * @param {Object} properties - Property name -> value
 * @param {boolean} isInitialLoad - True when the table was just (re)built for a device
 */
function uiUpdateDeviceProperties(properties, isInitialLoad = false) {
    if (!properties || typeof properties !== "object") {
        console.error("Invalid properties object provided");
        return;
    }

    if (isInitialLoad) {
        currentProperties.clear();
    }

    for (const [propName, propValue] of Object.entries(properties)) {
        currentProperties.set(propName, propValue);

        const definition = currentDefinitions.get(propName);
        if (!definition) continue;

        const propertyElement = document.querySelector(`[data-property="${CSS.escape(propName)}"] .device-info-value`);
        if (propertyElement) {
            propertyElement.innerHTML = uiFormatPropertyValue(propValue, definition);
        }
    }

    uiUpdateWifiBars();
}

function uiUpdateWifiBars() {
    const wifiElement = document.getElementById("device-wifi");

    if (currentProperties.get("wifiRssi") !== undefined || currentProperties.get("wifiSignalLevel") !== undefined) {
        wifiElement.style.display = "contents";

        const wifiBars = document.getElementById("device-wifi-bars");
        if (wifiBars) {
            wifiBars.innerHTML = uiMakeWifiBars(currentProperties.get("wifiSignalLevel"), currentProperties.get("wifiRssi"));
            wifiBars.title = `${currentProperties.get("wifiRssi")} dBm`;
        }
    } else {
        wifiElement.style.display = "none";
    }
}

function uiMakeWifiBars(signalLevel, rssi) {
    let bars = 0;

    if (signalLevel !== undefined && signalLevel !== null) {
        bars = parseInt(signalLevel);
    } else if (rssi !== undefined && rssi !== null) {

        if (rssi > -60) bars = 4;
        else if (rssi > -70) bars = 3;
        else if (rssi > -80) bars = 2;
        else if (rssi > -90) bars = 1;
    }

    return `<div class="wifi-bars">
            <div class="wifi-bar${bars >= 1 ? ' active' : ''}"></div>
            <div class="wifi-bar${bars >= 2 ? ' active' : ''}"></div>
            <div class="wifi-bar${bars >= 3 ? ' active' : ''}"></div>
            <div class="wifi-bar${bars >= 4 ? ' active' : ''}"></div>
        </div>`;
};
