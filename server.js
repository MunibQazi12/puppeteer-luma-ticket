require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("chrome-aws-lambda");

const app = express();
app.use(express.json());

async function launchBrowser() {
  let executablePath;

  try {
    executablePath = await chromium.executablePath;
  } catch (e) {
    console.error("❌ Failed to get chromium.executablePath:", e.message);
  }

  console.log("👉 chromium.executablePath:", executablePath);

  if (!executablePath) {
    throw new Error("❌ No Chrome executablePath found. This will break on Render.");
  }

  return await puppeteer.launch({
    executablePath,
    headless: chromium.headless,
    args: chromium.args,
    ignoreHTTPSErrors: true,
    defaultViewport: chromium.defaultViewport,
  });
}




async function createTicket(page, steps, name, description) {
  steps.push(`Opening modal to create: ${name}`);

  await page.waitForSelector('input[name="name"]', { hidden: true, timeout: 10000 });

  await page.waitForSelector("button .label", { timeout: 10000 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      b.innerText.includes("New Ticket Type")
    );
    if (btn) btn.click();
  });

  steps.push("Waiting for modal to appear");
  await page.waitForSelector('input[name="name"]', { timeout: 10000 });

  steps.push(`Typing Ticket Name: ${name}`);
  await page.click('input[name="name"]', { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type('input[name="name"]', name, { delay: 50 });

  steps.push("Clicking Add Description");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      b.innerText.includes("Add Description")
    );
    if (btn) btn.click();
  });

  steps.push("Typing description");
  await page.waitForSelector("textarea", { timeout: 5000 });
  await page.focus("textarea");
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type("textarea", description, { delay: 40 });

  steps.push("Enabling approval toggle");
  await page.evaluate(() => {
    const toggle = document.querySelector("#require-approval-toggle");
    if (toggle && !toggle.checked) toggle.click();
  });

  steps.push("Submitting ticket form");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      b.innerText.includes("Create Ticket Type")
    );
    if (btn) btn.click();
  });

  steps.push("Waiting for modal to close");
  await page.waitForSelector('input[name="name"]', { hidden: true, timeout: 10000 });

  steps.push(`✅ Created ticket: ${name}`);
}

app.post("/create-tickets", async (req, res) => {
  const steps = [];
  const { eventID } = req.body;
  if (!eventID) return res.status(400).send("Missing eventID");

  try {
    steps.push("Launching browser");
    const browser = await launchBrowser();
    const page = await browser.newPage();

    page.on("error", err => console.error("Page crashed:", err));
    page.on("pageerror", err => console.error("Page error:", err));

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114 Safari/537.36"
    );

    steps.push("Opening google.com");
    await page.goto("https://www.google.com", { timeout: 30000 });

    steps.push("Redirecting to lu.ma/signin");
    await page.evaluate(() => {
      window.location.href = "https://lu.ma/signin";
    });
    await page.waitForNavigation({ timeout: 60000 });

    steps.push("Typing email");
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', process.env.LUMA_EMAIL, { delay: 50 });

    steps.push("Clicking Continue with Email");
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(b =>
        b.textContent.includes("Continue with Email")
      );
      if (btn) btn.click();
    });

    steps.push("Waiting for password field");
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.waitForSelector('input[type="password"]', {
      timeout: 15000,
      visible: true,
    });

    steps.push("Typing password");
    await page.type('input[type="password"]', process.env.LUMA_PASSWORD, { delay: 50 });

    steps.push("Waiting for Continue button");
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll("button")].find(b =>
        b.textContent.trim() === "Continue"
      );
      return btn && !btn.disabled;
    }, { timeout: 15000 });

    steps.push("Clicking final Continue");
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(b =>
        b.textContent.trim() === "Continue"
      );
      if (btn) btn.click();
    });

    steps.push("Waiting for dashboard");
    await page.waitForNavigation({
      timeout: 60000,
      waitUntil: "networkidle0",
    });

    const currentUrl = page.url();
    if (!currentUrl.startsWith("https://lu.ma/home")) {
      throw new Error("Login did not redirect to dashboard");
    }

    const targetURL = `https://lu.ma/event/manage/${eventID}/registration`;
    steps.push("Navigating to: " + targetURL);
    await page.goto(targetURL, { timeout: 60000 });

    await createTicket(
      page,
      steps,
      "General Ticket",
      "Access to networking dinner (food, beverage & gratuity not included in price)"
    );

    await new Promise(resolve => setTimeout(resolve, 3000));

    await createTicket(
      page,
      steps,
      "Early Bird Ticket",
      "Early-bird access to networking dinner (food, beverage & gratuity not included in price)"
    );

    steps.push("✅ Both tickets created successfully");
    await browser.close();
    steps.push("✅ Browser closed");

    return res.send({ status: "success", steps });
  } catch (err) {
    console.error("❌ Error during ticket creation:", err.message);
    return res.status(500).json({
      status: "error",
      steps,
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
