const express = require("express");
// const puppeteer = require("puppeteer-core");

const app = express();
app.use(express.json());

app.post("/create-tickets", async (req, res) => {
  const { eventID } = req.body;

  if (!eventID) {
    return res.status(400).send("Missing eventID");
  }

  try {
    // const browser = await puppeteer.launch({
    //   headless: true,
    //   args: ['--no-sandbox', '--disable-setuid-sandbox']
    // });


    // const browser = await puppeteer.launch({
    //   headless: true,
    //   executablePath: "/usr/bin/chromium",
    //   args: ['--no-sandbox', '--disable-setuid-sandbox']
    // });

    // const puppeteer = require('puppeteer-core');

    // const browser = await puppeteer.launch({
    //   headless: true,
    //   executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    //   args: ['--no-sandbox', '--disable-setuid-sandbox']
    // });


    const puppeteer = require('puppeteer-core');

    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });



    const page = await browser.newPage();
    await page.goto(`https://lu.ma/event/manage/${eventID}/registration`, {
      waitUntil: 'networkidle2'
    });

    // TODO: Add ticket form-filling logic here

    await browser.close();
    res.send("Tickets created");
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));