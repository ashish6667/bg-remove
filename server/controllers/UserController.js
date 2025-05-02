import { Webhook } from "svix";
import userModel from "../models/userModel.js";
import transactionModel from "../models/transactionModel.js";
import razorpay from "razorpay";
import crypto from "crypto";

// Gateway initialization
const razorpayInstance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Clerk Webhook Handler
const clerkWebhooks = async (req, res) => {
  try {
    const whook = new Webhook(process.env.CLERK_WEBHOOK_SECRET);

    await whook.verify(JSON.stringify(req.body), {
      "svix-id": req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"],
    });

    const { data, type } = req.body;

    switch (type) {
      case "user.created": {
        await userModel.create({
          clerkId: data.id,
          email: data.email_addresses[0].email_address,
          firstName: data.first_name,
          lastName: data.last_name,
          photo: data.image_url,
        });
        break;
      }

      case "user.updated": {
        await userModel.findOneAndUpdate(
          { clerkId: data.id },
          {
            email: data.email_addresses[0].email_address,
            firstName: data.first_name,
            lastName: data.last_name,
            photo: data.image_url,
          }
        );
        break;
      }

      case "user.deleted": {
        await userModel.findOneAndDelete({ clerkId: data.id });
        break;
      }

      default:
        console.log("Unknown event type");
    }

    res.status(200).json({});
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get user credits
const userCredits = async (req, res) => {
  try {
    const { clerkId } = req.body;
    const user = await userModel.findOne({ clerkId });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, credits: user.creditBalance });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Razorpay Payment Initialization
const paymentRazorpay = async (req, res) => {
  try {
    const { clerkId, planId } = req.body;

    const user = await userModel.findOne({ clerkId });
    if (!user || !planId) {
      return res.status(400).json({ success: false, message: "Invalid user or plan" });
    }

    let plan, credits, amount;
    switch (planId) {
      case "Basic":
        plan = "Basic";
        credits = 100;
        amount = 10;
        break;
      case "Advanced":
        plan = "Advanced";
        credits = 500;
        amount = 50;
        break;
      case "Business":
        plan = "Business";
        credits = 5000;
        amount = 250;
        break;
      default:
        return res.status(400).json({ success: false, message: "Invalid plan selected" });
    }

    const transaction = await transactionModel.create({
      clerkId,
      plan,
      credits,
      amount,
      date: Date.now(),
    });

    const order = await razorpayInstance.orders.create({
      amount: amount * 100,
      currency: process.env.CURRENCY || "INR",
      receipt: transaction._id.toString(),
    });

    res.json({ success: true, order });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Razorpay Payment Verification and Credit Update
const verifyRazorpay = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    const order = await razorpayInstance.orders.fetch(razorpay_order_id);
    const transaction = await transactionModel.findById(order.receipt);
    if (!transaction || transaction.payment) {
      return res.status(400).json({ success: false, message: "Invalid or already processed" });
    }

    const user = await userModel.findOne({ clerkId: transaction.clerkId });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.creditBalance += transaction.credits;
    await user.save();

    transaction.payment = true;
    await transaction.save();

    res.json({ success: true, message: "Payment verified and credits added" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export { clerkWebhooks, userCredits, paymentRazorpay, verifyRazorpay };
