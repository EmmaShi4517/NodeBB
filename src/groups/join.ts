// 'use strict';

import winston from 'winston';

import db from '../database';
import user from '../user';
import plugins from '../plugins';
import cache from '../cache';

// interface Groups {
//     create(data): void;
//     BANNED_USERS: string;
//     isPrivilegeGroup(groupName: string): boolean;
//     join(groupNames: string[], uid: number): Promise;
//     isMemberOfGroups(uid: number, groupNames: string[]);
//     exists(groupNames: string[]);
//     clearCache(uid: number, groupsToJoin: string[]);
//     getGroupsFields(groupsToJoin: string[], fields: string[])
// }

export = function (Groups): void {
    async function createNonExistingGroups(groupsToCreate: string[]): Promise<void> {
        if (!groupsToCreate.length) {
            return;
        }

        for (const groupName of groupsToCreate) {
            try {
                // eslint-disable-next-line no-await-in-loop
                // The next line calls a function in a module that has not been updated to TS yet
                // only disabling max-len for line to surpress eslint
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, no-await-in-loop
                await Groups.create({
                    name: groupName,
                    hidden: 1,
                });
            } catch (err) {
                // Unable assign a type to err
                // (Catch clause variable type annotation must be 'any' or 'unknown' if specified)
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                if (err && err.message !== '[[error:group-already-exists]]') {
                    winston.error(`[groups.join] Could not create new hidden group (${groupName})\n${err.stack}`);
                    throw err;
                }
            }
        }
    }
    async function setGroupTitleIfNotSet(groupNames: string[], uid: number): Promise<void> {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const ignore = ['registered-users', 'verified-users', 'unverified-users', Groups.BANNED_USERS];
        groupNames = groupNames.filter(
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            groupName => !ignore.includes(groupName) && !Groups.isPrivilegeGroup(groupName)
        );
        if (!groupNames.length) {
            return;
        }

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const currentTitle: string = await db.getObjectField(`user:${uid}`, 'groupTitle');
        if (currentTitle || currentTitle === '') {
            return;
        }

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await user.setUserField(uid, 'groupTitle', JSON.stringify(groupNames));
    }
    Groups.join = async function (groupNames: string[], uid: number): Promise<void> {
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
        // Need further investigation on types of these three
        const [isMembers, exists, isAdmin] = await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            Groups.isMemberOfGroups(uid, groupNames),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            Groups.exists(groupNames),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            user.isAdministrator(uid),
        ]);

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const groupsToCreate = groupNames.filter((groupName, index) => groupName && !exists[index]);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const groupsToJoin = groupNames.filter((groupName, index) => !isMembers[index]);

        if (!groupsToJoin.length) {
            return;
        }
        await createNonExistingGroups(groupsToCreate);

        const promises = [
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.sortedSetsAdd(groupsToJoin.map(groupName => `group:${groupName}:members`), Date.now(), uid),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.incrObjectField(groupsToJoin.map(groupName => `group:${groupName}`), 'memberCount'),
        ];
        if (isAdmin) {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            promises.push(db.setsAdd(groupsToJoin.map(groupName => `group:${groupName}:owners`), uid));
        }

        await Promise.all(promises);

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        Groups.clearCache(uid, groupsToJoin);
        cache.del(groupsToJoin.map(name => `group:${name}:members`));
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const groupData = await Groups.getGroupsFields(groupsToJoin, ['name', 'hidden', 'memberCount']);
        const visibleGroups = groupData.filter(groupData => groupData && !groupData.hidden);

        if (visibleGroups.length) {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            await db.sortedSetAdd(
                'groups:visible:memberCount',
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                visibleGroups.map(groupData => groupData.memberCount),
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                visibleGroups.map(groupData => groupData.name)
            );
        }

        await setGroupTitleIfNotSet(groupsToJoin, uid).catch();

        plugins.hooks.fire('action:group.join', {
            groupNames: groupsToJoin,
            uid: uid,
        });
    };
}
