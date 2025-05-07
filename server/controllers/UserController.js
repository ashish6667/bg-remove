import { Webhook } from "svix";
import userModel from "../models/userModel.js";
import transactionModel from "../models/transactionModel.js";
import razorpay from "razorpay";
import crypto from "crypto";

// Clerk Webhook handler
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
        const userData = {
          clerkId: data.id,
          email: data.email_addresses[0].email_address,
          firstName: data.first_name,
          lastName: data.last_name,
          photo: data.image_url,
        };
        await userModel.create(userData);
        return res.json({});
      }

      case "user.updated": {
        const userData = {
          email: data.email_addresses[0].email_address,
          firstName: data.first_name,
          lastName: data.last_name,
          photo: data.image_url,
        };

        await userModel.findOneAndUpdate({ clerkId: data.id }, userData);
        return res.json({});
      }

      case "user.deleted": {
        await userModel.findOneAndDelete({ clerkId: data.id });
        return res.json({});
      }

      default:
        console.log("Unknown event type");
        return res.status(400).json({ success: false, message: "Unhandled webhook type" });
    }
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get user credit balance
const userCredits = async (req, res) => {
  try {
    const clerkId = req.clerkId;
    const userData = await userModel.findOne({ clerkId });

    res.json({ success: true, credits: userData?.creditBalance || 0 });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Razorpay config
const razorpayInstance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create payment order
const paymentRazorpay = async (req, res) => {
  try {
    const { planId } = req.body;
    const clerkId = req.clerkId;

    const userData = await userModel.findOne({ clerkId });
    if (!userData) {
      return res.status(400).json({ success: false, message: "Invalid User" });
    }

    let credits, plan, amount;
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
        return res.status(400).json({ success: false, message: "Invalid Plan" });
    }

    const transactionData = {
      clerkId,
      plan,
      amount,
      credits,
      date: Date.now(),
    };

    const newTransaction = await transactionModel.create(transactionData);

    const options = {
      amount: amount * 100,
      currency: process.env.CURRENCY || "INR",
      receipt: newTransaction._id.toString(),
      notes: { planId, credits, clerkId },
    };

    const order = await razorpayInstance.orders.create(options);

    res.json({ success: true, order });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Verify Razorpay Payment Signature
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature!" });
    }

    res.json({ success: true, message: "Payment verified successfully!" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Final credit update after payment success
const verifyRazorpay = async (req, res) => {
  try {
    const { razorpay_order_id } = req.body;

    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);
    if (orderInfo.status !== "paid") {
      return res.json({ success: false, message: "Payment not successful" });
    }

    const transactionData = await transactionModel.findById(orderInfo.receipt);
    if (transactionData.payment) {
      return res.json({ success: false, message: "Payment already processed" });
    }

    const userData = await userModel.findOne({ clerkId: transactionData.clerkId });
    const newCredits = userData.creditBalance + transactionData.credits;

    await userModel.findByIdAndUpdate(userData._id, { creditBalance: newCredits });
    await transactionModel.findByIdAndUpdate(transactionData._id, { payment: true });

    res.json({ success: true, message: "Credits Added" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  clerkWebhooks,
  userCredits,
  paymentRazorpay,
  verifyPayment,
  verifyRazorpay
};
