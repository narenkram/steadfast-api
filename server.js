const express = require("express");
const bodyparser = require("body-parser");
const port = 8000;
const app = express();

app.use(bodyparser.urlencoded({ extended: true }))

app.get("/", function (req, res) {
    let data = {
        "name": "tom"
    }
    res.json(data)
})

app.post("/get-data", function (req, res) {
    let data = {
        "status": "working"
    }
    res.json(data)
})

app.listen(port, function () {
    console.log("API Server running", port)
})