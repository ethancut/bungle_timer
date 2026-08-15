const wsUri = "ws://localhost:8080";

const settingsElements = [
    document.getElementById('bits'),
    document.getElementById('subs'),
    document.getElementById('donations')
];
const values = { bits: 0, subs: 0, donations: 0 };
const keys = ['bits', 'subs', 'donations'];

function isNumeric(str) {
    if (typeof str != "string") return false;
    return !isNaN(str) && !isNaN(parseFloat(str));
}

function initTimer() {

    settingsElements.forEach((element, index) => {
        element.addEventListener('input', (event) => {
            console.log(event.target.value)
            values[keys[index]] = parseFloat(event.target.value);
            validateElements();
        });
    });

    //TODO: populate existing values
    const websocket = new WebSocket(wsUri);
    let messagebox = document.getElementById('message-box');
    websocket.addEventListener('open', (event) => {
        console.log("Connected to WebSocket server");
        document.getElementById('status').textContent = "Connected";
    });

    document.getElementById('send-message').addEventListener("click", (event) => {
        websocket.send(messagebox.value);
    });
    websocket.addEventListener('message', (message) => {
        console.log("RECEIVED: ", message.data);
    });

    websocket.addEventListener('close', (event) => {
        document.getElementById('status').textContent = "Disconnected";
    });
    websocket.addEventListener('error', (event) => {
        console.log("Websocket error:", event);
    });

    validateElements();
}
function validateElements() {
    for (const element of settingsElements) {
        if (!isNumeric(element.value)) {
            element.classList.add('invalid-input');
        } else {
            element.classList.remove('invalid-input');
        }
    }
}

initTimer();