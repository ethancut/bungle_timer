package main

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/websocket"
)

type webSocketHandler struct {
	upgrader websocket.Upgrader
}

type subConfig struct {
	bitTime  int
	subTime  int
	donoTime int
}

func CheckOrigin(r *http.Request) bool {
	return true
}
func (wsh webSocketHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	c, err := wsh.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("error %s when upgrading connection to websocket", err)
		return
	}
	defer func() {
		log.Println("Closing connection")
		c.Close()
	}()

	i := 1
	for {
		mt, message, err := c.ReadMessage()
		if err != nil {
			log.Printf("error %s when reading message", err)
			break
		}
		log.Printf("Received message of type %d: %s", mt, message)

		response := []byte("Response " + strconv.Itoa(i) + " to message: " + string(message))
		i++
		if err = c.WriteMessage(mt, response); err != nil {
			log.Printf("error %s when writing message", err)
			break

		}

	}
}

func main() {
	webSocketHandler := webSocketHandler{
		upgrader: websocket.Upgrader{CheckOrigin: CheckOrigin},
	}

	http.Handle("/", webSocketHandler)
	log.Print("Starting server")
	log.Fatal(http.ListenAndServe("localhost:8080", nil))
}
