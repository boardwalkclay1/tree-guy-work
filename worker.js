import { MongoClient, ObjectId } from "mongodb";

let cachedDb = null;

async function getDb(env) {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  cachedDb = client.db(env.MONGODB_DB);
  return cachedDb;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path === "/api/tree-guy/signup" && method === "POST") {
      return signupTreeGuy(request, env);
    }

    if (path === "/api/client/signup" && method === "POST") {
      return signupClient(request, env);
    }

    if (path === "/api/login" && method === "POST") {
      return login(request, env);
    }

    if (path === "/api/jobs/create" && method === "POST") {
      return createJob(request, env);
    }

    if (path === "/api/jobs/list" && method === "GET") {
      return listJobs(request, env);
    }

    return new Response("Not found", { status: 404 });
  }
};

async function signupTreeGuy(request, env) {
  const db = await getDb(env);
  const body = await request.json();
  const { email, name, phone, city, state, username, password } = body;

  if (!email || !name || !phone || !city || !state || !username || !password) {
    return jsonError("Missing fields", 400);
  }

  const treeGuys = db.collection("tree_guys");

  const exists = await treeGuys.findOne({
    $or: [{ email }, { username }]
  });

  if (exists) return jsonError("Email or username already used", 400);

  const now = new Date();

  const result = await treeGuys.insertOne({
    email,
    name,
    phone,
    city,
    state,
    username,
    password_hash: btoa(password),
    status: "pending",
    active_until: null,
    created_at: now.toISOString()
  });

  return jsonOk({ treeGuyId: result.insertedId.toString() });
}

async function signupClient(request, env) {
  const db = await getDb(env);
  const body = await request.json();
  const { email, name, location, username, password } = body;

  if (!email || !name || !location || !username || !password) {
    return jsonError("Missing fields", 400);
  }

  const clients = db.collection("clients");

  const exists = await clients.findOne({
    $or: [{ email }, { username }]
  });

  if (exists) return jsonError("Email or username already used", 400);

  const now = new Date();

  const result = await clients.insertOne({
    email,
    name,
    location,
    username,
    password_hash: btoa(password),
    created_at: now.toISOString()
  });

  return jsonOk({ clientId: result.insertedId.toString() });
}

async function login(request, env) {
  const db = await getDb(env);
  const body = await request.json();
  const { username, password } = body;

  if (!username || !password) return jsonError("Missing fields", 400);

  const hash = btoa(password);

  const treeGuys = db.collection("tree_guys");
  const clients = db.collection("clients");

  let user = await treeGuys.findOne({ username, password_hash: hash });
  let type = "tree_guy";

  if (!user) {
    user = await clients.findOne({ username, password_hash: hash });
    type = "client";
  }

  if (!user) return jsonError("Invalid login", 401);

  return jsonOk({
    userId: user._id.toString(),
    type,
    username: user.username,
    name: user.name || user.email
  });
}

async function createJob(request, env) {
  const db = await getDb(env);
  const body = await request.json();
  const { clientId, title, description, location } = body;

  if (!clientId || !title || !description || !location) {
    return jsonError("Missing fields", 400);
  }

  const jobs = db.collection("jobs");
  const now = new Date();

  const result = await jobs.insertOne({
    client_id: clientId,
    title,
    description,
    location,
    status: "open",
    created_at: now.toISOString()
  });

  return jsonOk({ jobId: result.insertedId.toString() });
}

async function listJobs(request, env) {
  const db = await getDb(env);
  const jobs = db.collection("jobs");

  const docs = await jobs
    .find({ status: "open" })
    .sort({ created_at: -1 })
    .limit(50)
    .toArray();

  return jsonOk({
    jobs: docs.map(j => ({
      id: j._id.toString(),
      title: j.title,
      description: j.description,
      location: j.location,
      status: j.status,
      created_at: j.created_at
    }))
  });
}

function jsonOk(data) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
