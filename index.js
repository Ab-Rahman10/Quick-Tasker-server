require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
// const jwt = require("jsonwebtoken");

// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.euk0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("quickTasker");
    const userCollection = db.collection("users");

    // users related APIs
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      const email = userInfo.email;
      const filter = { email };
      const existingEmail = await userCollection.findOne(filter);
      if (existingEmail) {
        return res.send({ message: "This user is already exists." });
      }
      const result = await userCollection.insertOne(userInfo);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Quick Tasker is running...");
});

app.listen(port, () => {
  console.log(`Quick Tasker is running on port ${port}`);
});
