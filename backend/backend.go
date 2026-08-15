package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
)

const configPath = "config.json"

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Config struct {
	Bits      int `json:"bits"`
	Subs      int `json:"subs"`
	Donations int `json:"donations"`
}
type Message struct {
	Type      string `json:"type"`
	Bits      int    `json:"bits,omitempty"`
	Subs      int    `json:"subs,omitempty"`
	Donations int    `json:"donations,omitempty"`
	Remaining int    `json:"remaining,omitempty"`
	Seconds   int    `json:"seconds,omitempty"`
	Reason    string `json:"reason,omitempty"`
}
type State struct {
	mu        sync.Mutex
	config    Config
	remaining int

	settingsConn *websocket.Conn
	overlayConn  *websocket.Conn
}

func (s *State) sendTo(conn *websocket.Conn, msg Message) {
	if conn == nil {
		return
	}
	if err := conn.WriteJSON(msg); err != nil {
		conn.Close()
	}
}

func (s *State) settingsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error: ", err)
	}
	s.mu.Lock()
	s.settingsConn = conn
	cfg := s.config
	cfg.Bits = 1
	s.mu.Unlock()

	conn.WriteJSON(Message{Type: "config", Bits: cfg.Bits, Subs: cfg.Subs, Donations: cfg.Donations})

	defer func() {
		log.Println("Closing settingspage websocket")
		s.mu.Lock()
		if s.settingsConn == conn {
			s.settingsConn = nil
		}
		s.mu.Unlock()
		conn.Close()
	}()
	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			log.Println("Settings read error", err)
			break
		}
		switch msg.Type {
		case "config":
			s.mu.Lock()
			s.config = Config{Bits: msg.Bits, Subs: msg.Subs, Donations: msg.Donations}
			var file *os.File = nil
			if file, err = os.OpenFile(configPath, os.O_CREATE, os.ModePerm); err != nil {
				log.Println("Error opening config file: ", err)
				break
			}
			encoder := json.NewEncoder(file)
			if err := encoder.Encode(s.config); err != nil {
				log.Println("Error writing config file: ", err)
				break
			}
			s.mu.Unlock()
			log.Printf("Config updated: %+v\n", s.config)
		}
	}
}
func main() {

	state := &State{}

	http.HandleFunc("/ws/settings", state.settingsHandler)
	log.Print("Starting server")
	log.Fatal(http.ListenAndServe("localhost:8080", nil))
}
