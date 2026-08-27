const wsUri = "ws://localhost:8080/ws/settings";


const MAX_RECONNECT_DELAY = 5000;

const bitsElement = document.getElementById('bits');
const subsElement = document.getElementById('subs');
const subs2Element = document.getElementById('subs2');
const subs3Element = document.getElementById('subs3');
const donationsElement = document.getElementById('donations');
const startdurationElement = document.getElementById('start-duration')
const seTokenElement = document.getElementById('se-token');

const timeDurationElements = [bitsElement, subsElement, subs2Element, subs3Element, donationsElement];

const config = { bits: 0, subs: 0, subs2: 0, subs3: 0, donations: 0, streamElementsToken: "", overlayType: "", startDuration: "" };
const statusElement = document.getElementById('submit-status');
const timeEntryElement = document.getElementById('time-box');
const pauseElement = document.getElementById('pause-timer');
const addTypeElement = document.getElementById('add-type');
let streamElementsToken = "";
let startDuration = ""

let websocket = null;
let reconnectDelay = 1000;

function isNumeric(str) {
    if (typeof str != "string") return false;
    return !isNaN(str) && !isNaN(parseFloat(str));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));



function updateConfigDisplay() {
    bitsElement.value = config.bits
    subsElement.value = config.subs
    subs2Element.value = config.subs2
    subs3Element.value = config.subs3
    donationsElement.value = config.donations;

    seTokenElement.value = config.streamElementsToken

    startdurationElement.value = config.startDuration;
    if (config.overlayType == "overlay1") {
        document.getElementById('start_plus_dur').checked = true
    } else {
        document.getElementById('dur').checked = true
    }
    updateStartDurationVisibility(true);
}



function updateConfig(msg) {
    config.bits = msg.bits;
    config.subs = msg.subs;
    config.subs2 = msg.subs2;
    config.subs3 = msg.subs3;
    config.donations = msg.donations;
    config.streamElementsToken = msg.streamElementsToken
    config.overlayType = msg.overlayType
    config.startDuration = msg.startDuration ?? ""

    updateConfigDisplay();

    validateElements();
}
function pushConfig() {
    if (websocket.readyState == WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'config', ...config }))
    } else {
        statusNotify({ reason: "Failed to Save Config: Backend Offline" })
    }
}

function updateStartDurationVisibility(update) {
    const selected = document.querySelector('input[name="overlay-format"]:checked');
    console.log("selected value:", JSON.stringify(selected?.value));
    const startDurationWrap = document.getElementById('start-duration-wrap');
    if (!selected || !startDurationWrap) return;

    if (selected.value === 'dur') {
        startDurationWrap.style.display = 'none';
        if (update === true) {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({ type: 'overlay2' }));
            }
        }

    } else {
        if (update === true) {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({ type: 'overlay1', reason: config.startDuration }));
            }
        }
        startDurationWrap.style.display = 'inline-block';
    }
}
function init() {
    showTab('config', document.getElementById('tab-config'));

    connect();

    document.querySelectorAll('input[name="overlay-format"]').forEach((radio) => {
        radio.addEventListener('change', () => updateStartDurationVisibility(true));
    });
    updateStartDurationVisibility();
    startdurationElement.addEventListener('input', (event) => {
        startDuration = event.target.value;
        console.log("set start dur to", startDuration);

        // also push it live if this format is currently selected
        const selected = document.querySelector('input[name="overlay-format"]:checked');

        if (selected && websocket && websocket.readyState === WebSocket.OPEN) {
            if (selected.value === 'dur') {
                websocket.send(JSON.stringify({ type: 'overlay2', reason: startDuration }));
                config.overlayType = 'overlay2';
            } else if (selected.value === 'start_plus_dur') {
                websocket.send(JSON.stringify({ type: 'overlay1', reason: startDuration }));
                config.overlayType = 'overlay1'
            }
        }
    });

    document.getElementById('add-time').addEventListener("click", (event) => {
        const value = parseFloat(timeEntryElement.value, 10)
        const addType = addTypeElement.value;
        if (!websocket || websocket.readyState !== WebSocket.OPEN || isNaN(value)) {
            return;
        }
        let seconds;
        switch (addType) {
            case "seconds":
                seconds = value;
                break;
            case "minutes":
                seconds = value * 60;
                break;
            case "bits":
                seconds = value * config['bits'];
                break;
            case "subs":
                seconds = value * config['subs'];
                break;
            case 'donations':
                seconds = value * config['donations'];
                break
        }
        websocket.send(JSON.stringify({ type: "add", seconds: Math.round(seconds) }));
    });
    pauseElement.addEventListener("click", (event) => {
        websocket.send(JSON.stringify({ type: 'pause' }))
    })
    bitsElement.addEventListener('input', (event) => {
        config.bits = parseFloat(event.target.value);
        validateElements();
    });
    subsElement.addEventListener('input', (event) => {
        config.subs = parseFloat(event.target.value);
        validateElements();
    });
    subs2Element.addEventListener('input', (event) => {
        config.subs2 = parseFloat(event.target.value);
        validateElements();
    });
    subs3Element.addEventListener('input', (event) => {
        config.subs3 = parseFloat(event.target.value);
        validateElements();
    });
    donationsElement.addEventListener('input', (event) => {
        config.donations = parseFloat(event.target.value);
        validateElements();
    });

    seTokenElement.addEventListener('input', (event) => {
        config.streamElementsToken = event.target.value;
    })
    document.getElementById('submit-config').addEventListener('click', (event) => {
        pushConfig();
    })
    startdurationElement.addEventListener('input', (event) => {
        config.startDuration = event.target.value;
    })



    validateElements();
}

async function statusNotify(msg) {
    if (msg.reason == 'true') {
        statusElement.style.color = "green"
        statusElement.textContent = "Saved Successfully"
        await sleep(2000);
        if (statusElement.textContent === "Saved Successfully") {
            statusElement.textContent = ""
        }
    } else {
        statusElement.style.color = "red"
        statusElement.textContent = msg.reason
        await sleep(5000);
        if (statusElement.textContent === msg.reason) {
            statusElement.textContent = ""
        }

    }
}


function connect() {
    websocket = new WebSocket(wsUri);
    const statusEl = document.getElementById('status');
    websocket.addEventListener('open', (event) => {
        console.log("Connected to WebSocket server");
        reconnectDelay = 1000;
        document.getElementById('status').textContent = "Connected";
    });
    websocket.addEventListener('message', (event) => {
        let msg;
        try { msg = JSON.parse(event.data); }
        catch (err) {
            console.error("Bad WS message:", event.data, err);
            return;
        }

        if (msg.type == "config") {
            updateConfig(msg)
        } else if (msg.type == "status") {
            statusNotify(msg)
        } else if (msg.type == "togglePause") {
            if (msg.paused == true) {
                pauseElement.textContent = "Unpause Timer"
            } else {
                pauseElement.textContent = "Pause Timer"
            }
        }
    });
    websocket.addEventListener('close', (event) => {
        document.getElementById('status').textContent = "Disconnected";
        scheduleReconnect();
    });
    websocket.addEventListener('error', (event) => {
        console.log("Websocket error:", event);
    });
}
function scheduleReconnect() {
    setTimeout(() => {
        console.log(`reconnecting (delay ${reconnectDelay}ms)`);
        connect();
        reconnectDelay = Math.min(reconnectDelay + 1000, MAX_RECONNECT_DELAY);
    }, reconnectDelay);
}
function validateElements() {
    for (const element of timeDurationElements) {
        if (element === seTokenElement) {
            if (element.value === "") {
                element.classList.add('invalid-input')
            } else {
                element.classList.remove('invalid-input')
            }
            continue;
        }
        else if (!isNumeric(element.value)) {
            element.classList.add('invalid-input');
        } else {
            element.classList.remove('invalid-input');
        }
    }
}
function showTab(pageName, element) {

    document.querySelectorAll('.tab-content').forEach((tab) => {
        tab.style.display = 'none';
    })
    document.querySelectorAll('.tab-link').forEach((tablink) => {
        tablink.style.backgroundColor = "";
    })
    document.getElementById(pageName).style.display = "flex";
    element.style.backgroundColor = '#1c2024';
}
init();