const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000);
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `SELECT *
                        FROM user
                        WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  if (userData === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const insertUserQuery = `INSERT INTO user
                                (name,username,password,gender)
                                VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      await database.run(insertUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT *
                        FROM user
                        WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  if (userData === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordValid = await bcrypt.compare(password, userData.password);
    if (isPasswordValid === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "My_Secrete_Key");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticatingToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_Secrete_Key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get(
  "/user/tweets/feed/",
  authenticatingToken,
  async (request, response) => {
    const { username } = request;
    const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
    const userData = await database.get(getUserQuery);
    const userId = userData.user_id;
    const getUserTweetsQuery = `SELECT user.username,tweet.tweet,tweet.date_time AS dateTime
                                FROM user
                                INNER JOIN follower ON user.user_id = follower.following_user_id
                                INNER JOIN tweet ON follower.following_user_id = tweet.user_id
                                WHERE follower.follower_user_id = ${userId}
                                ORDER BY tweet.date_time DESC
                                LIMIT 4;`;
    const tweetsArray = await database.all(getUserTweetsQuery);
    response.send(tweetsArray);
  }
);

app.get("/user/following/", authenticatingToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  const userId = userData.user_id;
  const getUserTweetsQuery = `SELECT user.name
                                FROM user
                                INNER JOIN follower ON user.user_id = follower.following_user_id
                                WHERE follower.follower_user_id = ${userId};`;
  const tweetsArray = await database.all(getUserTweetsQuery);
  response.send(tweetsArray);
});

app.get("/user/followers/", authenticatingToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  const userId = userData.user_id;
  const getUserTweetsQuery = `SELECT user.name
                                FROM user
                                INNER JOIN follower ON user.user_id = follower.follower_user_id
                                WHERE follower.following_user_id = ${userId};`;
  const tweetsArray = await database.all(getUserTweetsQuery);
  response.send(tweetsArray);
});

const checkUserFollowers = async (request, response, next) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserDetails = `SELECT *
                            FROM user
                            WHERE username = '${username}';`;
  const userData = await database.get(getUserDetails);
  const userId = userData.user_id;
  const getTweetUserQuery = `SELECT user.username
                                FROM user
                                JOIN follower ON user.user_id = follower.following_user_id
                                JOIN tweet ON follower.following_user_id = tweet.user_id
                                WHERE tweet.tweet_id = ${tweetId}
                                AND follower.follower_user_id = ${userId};`;
  const checkingUserFollowing = await database.get(getTweetUserQuery);
  if (checkingUserFollowing === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.get(
  "/tweets/:tweetId/",
  authenticatingToken,
  checkUserFollowers,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
    const userData = await database.get(getUserQuery);
    const userId = userData.user_id;
    const getTweetsQuery = `SELECT tweet.tweet, COUNT(DISTINCT like.like_id) AS likes, COUNT(DISTINCT reply.reply_id) AS replies, tweet.date_time AS dateTime
                        FROM follower
                        JOIN tweet ON tweet.user_id = follower.following_user_id
                        JOIN reply ON tweet.tweet_id = reply.tweet_id
                        JOIN like ON tweet.tweet_id = like.tweet_id
                        WHERE tweet.tweet_id = ${tweetId}
                        GROUP BY follower.follower_user_id
                        HAVING follower.follower_user_id = ${userId};`;
    const tweetsArray = await database.get(getTweetsQuery);
    response.send(tweetsArray);
  }
);

const objectToArray = (dbObject) => {
  let namesArray = [];
  for (eachObject of dbObject) {
    namesArray.push(eachObject["username"]);
  }
  return { likes: namesArray };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticatingToken,
  checkUserFollowers,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
    const userData = await database.get(getUserQuery);
    const userId = userData.user_id;
    const getLikesQuery = `SELECT  user.username
                        FROM tweet
                        INNER JOIN follower ON following_user_id = tweet.user_id
                        INNER JOIN like ON like.tweet_id = tweet.tweet_id
                        INNER JOIN user ON user.user_id = like.user_id
                        WHERE tweet.tweet_id = ${tweetId}
                        AND follower.follower_user_id = ${userId};`;
    const likesArray = await database.all(getLikesQuery);
    response.send(objectToArray(likesArray));
  }
);

const convertReplyAndUserToResponseObject = (dbObject) => {
  arrayOfReplyAndUsers = [];
  for (eachObject of dbObject) {
    arrayOfReplyAndUsers.push(eachObject);
  }
  return { replies: arrayOfReplyAndUsers };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticatingToken,
  checkUserFollowers,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
    const userData = await database.get(getUserQuery);
    const userId = userData.user_id;
    const getRepliesQuery = `SELECT  user.name,reply.reply
                        FROM tweet
                        INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
                        INNER JOIN user ON user.user_id = reply.user_id
                        INNER JOIN follower ON user.user_id = follower.following_user_id
                        WHERE tweet.tweet_id = ${tweetId}
                        AND follower.follower_user_id = ${userId};`;
    const repliesArray = await database.all(getRepliesQuery);
    response.send(convertReplyAndUserToResponseObject(repliesArray));
  }
);

app.get("/user/tweets/", authenticatingToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  const userId = userData.user_id;
  const getTweetsQuery = `SELECT tweet.tweet, COUNT(DISTINCT like.like_id) AS likes, COUNT(DISTINCT reply.reply_id) AS replies, tweet.date_time AS dateTime
                        FROM tweet
                        LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
                        LEFT JOIN like ON tweet.tweet_id = like.tweet_id
                        WHERE tweet.user_id = ${userId}
                        GROUP BY tweet.tweet_id;`;
  const tweetsArray = await database.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.post("/user/tweets/", authenticatingToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserQuery = `SELECT *
                                FROM user
                                WHERE username = '${username}';`;
  const userData = await database.get(getUserQuery);
  const userId = userData.user_id;
  const insertTweetQuery = `INSERT INTO tweet
                                (tweet,user_id) VALUES ('${tweet}',${userId});`;
  await database.run(insertTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticatingToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getTweetQuery = `SELECT *
                            FROM user
                            JOIN tweet ON tweet.user_id = user.user_id
                            WHERE tweet.tweet_id = ${tweetId}
                            AND user.username = '${username}';`;
    const tweetDetails = await database.get(getTweetQuery);
    if (tweetDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet
                                    WHERE tweet_id = ${tweetId};`;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
