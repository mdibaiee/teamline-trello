teamline-trello
===============
![Travis CI](https://img.shields.io/travis/mdibaiee/teamline-trello.svg)
![Codecov](https://img.shields.io/codecov/c/github/mdibaiee/teamline-trello.svg)
![GitHub](https://img.shields.io/github/downloads/mdibaiee/teamline-trello/latest/total.svg)

Sync Teamline database with Trello.

Configuration

```javascript
{
  sync: {
    trello: {
      app: YOUR_APP_KEY,
      user: YOUR_USER_KEY // See below
    }
  }
}
```

You can get your `app` key from [here](https://trello.com/app-key)
and your `user` key from [here](https://trello.com/1/connect?key=<YOUR_KEY>&name=Teamline&response_type=token&scope=read,write).
