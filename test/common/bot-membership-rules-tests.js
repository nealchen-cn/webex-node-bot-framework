// Variables an functions shared by all tests
var common = require("../common/common");
let framework = common.framework;
let userWebex = common.userWebex;
let disallowedUser = common.getDisallowedUser();
let User_Test_Space_Title = common.User_Test_Space_Title;

let assert = common.assert;
let validator = common.validator;
let when = common.when;

describe('User Created Room to create a Test Bot', () => {
  let userCreatedTestRoom, userCreatedRoomBot;
  let eventsData = {};
  // Define the messages we want to try sending to the bot
  let testMessages = [
    {msgText: 'hi', hearsInfo: {phrase: 'hi'}},
    {
      msgText: `Here is a file for ya`, 
      msgFiles: process.env.HOSTED_FILE,
      hearsInfo: {phrase: /.*file.*/im}
    }
  ];

  // Create a room as user to have test bot which will create other rooms
  before(() => userWebex.rooms.create({title: User_Test_Space_Title})
    .then((r) => {
      userCreatedTestRoom = r;
      return validator.isRoom(r);
    }));

  // Add our bot to the room and validate that it is spawned properly
  before(() => common.addBotToSpace('Add Bot to Space', framework, userCreatedTestRoom, eventsData)
    .then((b) => {
      userCreatedRoomBot = b;
      return validator.isBot(b);
    }));

  // Bot leaves rooms
  after(() => {
    if ((!userCreatedRoomBot) || (!userCreatedTestRoom)) {
      return Promise.resolve();
    }
    return common.botLeaveRoom('Bot Leaves Space', framework, userCreatedRoomBot, userCreatedTestRoom, eventsData);
  });

  // User deletes room -- cleanup
  after(() => {
    if (!userCreatedTestRoom) {
      return Promise.resolve();
    }
    return userWebex.rooms.remove(userCreatedTestRoom)
      //        .then(() => when.all([membershipDeleted, stopped, despawned]))
      .catch((reason) => {
        console.error('Failed to cleanup test room', reason);
        throw reason;
      });
  });

  describe('Bot Creates Room and Adds Memeber', () => {
    let botCreatedTestRoom, botCreatedRoomBot;
    let testName = 'Bot Creates Room and Adds Member';
    let eventsData = {};
    // Create a room as user to have test bot which will create other rooms
    before(() => {
      let testName = 'empty bot.newRoom() test';
      return common.botCreateRoom(testName, framework, userCreatedRoomBot, eventsData)
        .then((b) => {
          botCreatedRoomBot = b;
          botCreatedTestRoom = b.room;
          return when(botCreatedRoomBot);
        });
    });

    // Bot deletes room
    after(() => {
      if ((!botCreatedRoomBot) || (!botCreatedTestRoom)) {
        return Promise.resolve();
      }
      const membershipDeleted = new Promise((resolve) => {
        common.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
      });
      let despawned, stopped;
      if (botCreatedRoomBot.active) {
        stopped = new Promise((resolve) => {
          botCreatedRoomBot.stopHandler('testName', resolve);
        });
        despawned = new Promise((resolve) => {
          common.frameworkDespawnHandler(testName, framework, eventsData, resolve);
        });
      } else {
        // Our real despawn event will be "swallowed" if membership rules already did it
        stopped = Promise.resolve(true);
        despawned = new Promise((resolve) => {
          common.frameworkMembershipRulesEventHandler(testName, framework, ['despawn'], eventsData, false, resolve);
        });
      }


      return botCreatedRoomBot.implode()
        .then(() => when.all([membershipDeleted, stopped, despawned]))
        .catch((reason) => {
          console.error('Bot failed to exit room', reason);
        });
    });

    describe('Bot adds allowed user to space who iteracts with bot', () => {
      before(() => {
        testName = 'adds an allowed user to the room';
        return common.botAddUsersToSpace(testName, framework, botCreatedRoomBot,
          [common.userInfo.emails[0]], eventsData);
      });

      after(() => {
        testName = "removes allowed user from the room";
        return common.botRemoveUserFromSpace(testName, framework, botCreatedRoomBot,
          common.userInfo.emails[0], eventsData);
      });


      // loop through message tests..
      testMessages.forEach((testData) => {
        eventsData = {bot: botCreatedRoomBot};

        it(`user says ${testData.msgText}`, () => {
          let testName = `user says ${testData.msgText}`;
          return common.userSendMessage(testName, framework, userWebex,
            botCreatedRoomBot, eventsData, testData.hearsInfo, 
            testData.msgText, testData.msgFiles);
        });

        it(`bot should respond to ${testData.msgText}`, () => {
          let testName = `bot should respond to ${testData.msgText}`;
          let shouldBeAllowed = true;
          return common.botRespondsToTrigger(testName, framework,
            botCreatedRoomBot, eventsData, shouldBeAllowed);
        });

      });

      it(`Removes the framework.hears() handlers setup in previous ` +
      `${testMessages.length * 2} tests`, () => {
        testMessages.forEach((testData) => {
          framework.debug(`Cleaning up framework.hears(${testData.hearsInfo.phrase})...`);
          framework.clearHears(testData.hearsInfo.functionId);
        });
      });    


      describe('Adds and removes a disallowed user to the space', () => {

        //it('adds the disallowed users', () => {
        before(() => {
          testName = 'adds a disallowed user to the room';
          return common.botAddUsersToSpace(testName, framework, botCreatedRoomBot,
            [common.disallowedUserPerson.emails[0]], eventsData)
            .then(() => {
              assert((!botCreatedRoomBot.active), 
                "After adding dissallowed user, bot did move to inactive state.");
            });
        });

        after(`Removes the framework.hears() handlers setup in previous ` +
        `${testMessages.length * 2} tests`, () => {
          testName = "cleans up the hears handlers from these tests";
          testMessages.forEach((testData) => {
            framework.debug(`Cleaning up framework.hears(${testData.hearsInfo.phrase})...`);
            framework.clearHears(testData.hearsInfo.functionId);
          });
        });

        after(() => {
          testName = "removes a disallowed user from the room";
          return common.botRemoveUserFromSpace(testName, framework, botCreatedRoomBot,
            common.disallowedUserPerson.emails[0], eventsData)
            .then(() => {
              assert(botCreatedRoomBot.active, 
                "After removing dissallowed user, bot did not return to active state.");
            });
        });

        // loop through message tests..
        testMessages.forEach((testData) => {

          it(`user says "${testData.msgText}" to disallowed bot`, () => {
            let testName = `user says ${testData.msgText} to disallowed bot`;
            eventsData = {bot: botCreatedRoomBot};
            framework.debug(`${testName} test starting...`);
            return common.userSendMessage(testName, framework, userWebex,
              botCreatedRoomBot, eventsData, 
              testData.hearsInfo, testData.msgText, testData.msgFiles);
          });

          it(`bot shouldn't respond to ${testData.msgText}`, () => {
            let testName = `bot shouldn't respond to "${testData.msgText}"`;
            framework.debug(`${testName} test starting...`);
            return common.botRespondsToTrigger(testName, framework,
              botCreatedRoomBot, eventsData);
          });

        });

      });
    });

    describe('Bot adds allowed and disallowed user to space who iteract with bot', () => {

      before(() => {
        testName = 'adds an allowed user to the room';
        return common.botAddUsersToSpace(testName, framework, botCreatedRoomBot,
          [common.userInfo.emails[0], common.disallowedUserPerson.emails[0]], eventsData);
      });

      // loop through message tests from allowed user
      testMessages.forEach((testData) => {
        eventsData = {bot: botCreatedRoomBot};

        it(`allowed user says ${testData.msgText}`, () => {
          let testName = `allowed user says ${testData.msgText}`;
          return common.userSendMessage(testName, framework, userWebex,
            botCreatedRoomBot, eventsData, testData.hearsInfo, 
            testData.msgText, testData.msgFiles);
        });

        it(`bot shouldn't respond to ${testData.msgText} from allowed user`, () => {
          let testName = `bot shouldn't respond to ${testData.msgText} from allowed user`;
          let shouldBeAllowed = false;
          return common.botRespondsToTrigger(testName, framework,
            botCreatedRoomBot, eventsData, shouldBeAllowed);
        });

      });

      it(`Removes the framework.hears() handlers setup in previous ` +
      `${testMessages.length * 2} tests`, () => {
        testMessages.forEach((testData) => {
          framework.debug(`Cleaning up framework.hears(${testData.hearsInfo.phrase})...`);
          framework.clearHears(testData.hearsInfo.functionId);
        });
      });    


      // loop through message tests from disallowed user
      testMessages.forEach((testData) => {
        eventsData = {bot: botCreatedRoomBot};

        it(`allowed user says ${testData.msgText}`, () => {
          let testName = `allowed user says ${testData.msgText}`;
          return common.userSendMessage(testName, framework, disallowedUser,
            botCreatedRoomBot, eventsData, testData.hearsInfo, 
            testData.msgText, testData.msgFiles);
        });

        it(`bot shouldn't respond to ${testData.msgText} from allowed user`, () => {
          let testName = `bot shouldn't respond to ${testData.msgText} from allowed user`;
          let shouldBeAllowed = false;
          return common.botRespondsToTrigger(testName, framework,
            botCreatedRoomBot, eventsData, shouldBeAllowed);
        });

      });

      it(`Removes the framework.hears() handlers setup in previous ` +
      `${testMessages.length * 2} tests`, () => {
        testMessages.forEach((testData) => {
          framework.debug(`Cleaning up framework.hears(${testData.hearsInfo.phrase})...`);
          framework.clearHears(testData.hearsInfo.functionId);
        });
      });    

      describe('Removes the disallowed user to the space', () => {

        before(() => {
          testName = "removes a disallowed user from the room";
          return common.botRemoveUserFromSpace(testName, framework, botCreatedRoomBot,
            common.disallowedUserPerson.emails[0], eventsData)
            .then(() => {
              assert(botCreatedRoomBot.active, 
                "After removing dissallowed user, bot did not return to active state.");
            });
        });

        after(() => {
          testName = "cleans up the hears handlers from these tests";
          testMessages.forEach((testData) => {
            framework.debug(`Cleaning up framework.hears(${testData.hearsInfo.phrase})...`);
            framework.clearHears(testData.hearsInfo.functionId);
          });
        });

        // loop through message tests..
        testMessages.forEach((testData) => {

          it(`user says "${testData.msgText}" to disallowed bot`, () => {
            let testName = `user says ${testData.msgText} to disallowed bot`;
            eventsData = {bot: botCreatedRoomBot};
            framework.debug(`${testName} test starting...`);
            return common.userSendMessage(testName, framework, userWebex,
              botCreatedRoomBot, eventsData, 
              testData.hearsInfo, testData.msgText, testData.msgFiles);
          });

          it(`bot should respond to ${testData.msgText}`, () => {
            let testName = `bot should respond to "${testData.msgText}"`;
            let shouldBeAllowed = true;
            framework.debug(`${testName} test starting...`);
            return common.botRespondsToTrigger(testName, framework,
              botCreatedRoomBot, eventsData, shouldBeAllowed);
          });

        });

      });
    });
  });
});