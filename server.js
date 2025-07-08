const express = require("express");
const puppeteer = require("puppeteer");
const { execSync } = require("child_process");

const app = express();
app.use(express.json());


// ✅ Simple test route
app.get("/", async (req, res) => {
  try {
    const chromiumPath = execSync("which chromium").toString().trim();
    const browser = await puppeteer.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(
      `https://lu.ma/event/manage/evt-AzSk9qQDzaolFPD/registration`,
      {
        waitUntil: "networkidle2",
      },
    );

    const screenshotPath = `screenshot-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log("✅ Screenshot saved as", screenshotPath);

    const html = await page.content();
    console.log("🔍 Page HTML (partial):", html.slice(0, 1000));

    await browser.close();

    // ✅ Only one response
    res.send("Tickets created");
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});


app.post("/create-tickets", async (req, res) => {
  const { eventID } = req.body;

  if (!eventID) {
    return res.status(400).send("Missing eventID");
  }

  try {
    const browser = await puppeteer.launch({
      executablePath: puppeteer.executablePath(),
      headless: true,
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