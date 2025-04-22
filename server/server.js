import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import connectDB from './configs/mongodb.js'

// App Config
const PORT = process.env.PORT  || 4000
const app = express()
await connectDB()

// Initialize Middleware
app.use(express.json())
app.use(cors())
// API routes
app.get('/', (req, res) => {
  res.send("API Working");
});


app.listen(PORT, () => 
  console.log("Server is running on port "+PORT))
