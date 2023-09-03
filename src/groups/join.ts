// 'use strict';

// The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const winston = require('winston');

// The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const db = require('../database');
// The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const user = require('../user');
// The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const plugins = require('../plugins');
// The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const cache = require('../cache');

module.exports = function (Groups) {
    Groups.join = async function (groupNames, uid) {
        if (!groupNames) {
            throw new Error('[[error:invalid-data]]');
        }
        if (Array.isArray(groupNames) && !groupNames.length) {
            return;
        }
        if (!Array.isArray(groupNames)) {
            groupNames = [groupNames];
        }

        if (!uid) {
            throw new Error('[[error:invalid-uid]]');
        }

        const [isMembers, exists, isAdmin] = await Promise.all([
            Groups.isMemberOfGroups(uid, groupNames),
            Groups.exists(groupNames),
            user.isAdministrator(uid),
        ]);

        const groupsToCreate = groupNames.filter((groupName, index) => groupName && !exists[index]);
        const groupsToJoin = groupNames.filter((groupName, index) => !isMembers[index]);

        if (!groupsToJoin.length) {
            return;
        }
        await createNonExistingGroups(groupsToCreate);

        const promises = [
            db.sortedSetsAdd(groupsToJoin.map(groupName => `group:${groupName}:members`), Date.now(), uid),
            db.incrObjectField(groupsToJoin.map(groupName => `group:${groupName}`), 'memberCount'),
        ];
        if (isAdmin) {
            promises.push(db.setsAdd(groupsToJoin.map(groupName => `group:${groupName}:owners`), uid));
        }

        await Promise.all(promises);

        Groups.clearCache(uid, groupsToJoin);
        cache.del(groupsToJoin.map(name => `group:${name}:members`));

        const groupData = await Groups.getGroupsFields(groupsToJoin, ['name', 'hidden', 'memberCount']);
        const visibleGroups = groupData.filter(groupData => groupData && !groupData.hidden);

        if (visibleGroups.length) {
            await db.sortedSetAdd(
                'groups:visible:memberCount',
                visibleGroups.map(groupData => groupData.memberCount),
                visibleGroups.map(groupData => groupData.name)
            );
        }

        await setGroupTitleIfNotSet(groupsToJoin, uid);

        plugins.hooks.fire('action:group.join', {
            groupNames: groupsToJoin,
            uid: uid,
        });
    };

    async function createNonExistingGroups(groupsToCreate) {
        if (!groupsToCreate.length) {
            return;
        }

        for (const groupName of groupsToCreate) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await Groups.create({
                    name: groupName,
                    hidden: 1,
                });
            } catch (err) {
                if (err && err.message !== '[[error:group-already-exists]]') {
                    winston.error(`[groups.join] Could not create new hidden group (${groupName})\n${err.stack}`);
                    throw err;
                }
            }
        }
    }

    async function setGroupTitleIfNotSet(groupNames, uid) {
        const ignore = ['registered-users', 'verified-users', 'unverified-users', Groups.BANNED_USERS];
        groupNames = groupNames.filter(
            groupName => !ignore.includes(groupName) && !Groups.isPrivilegeGroup(groupName)
        );
        if (!groupNames.length) {
            return;
        }

        const currentTitle = await db.getObjectField(`user:${uid}`, 'groupTitle');
        if (currentTitle || currentTitle === '') {
            return;
        }

        await user.setUserField(uid, 'groupTitle', JSON.stringify(groupNames));
    }
};
