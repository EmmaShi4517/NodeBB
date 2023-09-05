"use strict";
// 'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const winston_1 = __importDefault(require("winston"));
const database_1 = __importDefault(require("../database"));
const user_1 = __importDefault(require("../user"));
const plugins_1 = __importDefault(require("../plugins"));
const cache_1 = __importDefault(require("../cache"));
module.exports = function (Groups) {
    function createNonExistingGroups(groupsToCreate) {
        return __awaiter(this, void 0, void 0, function* () {
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
                    yield Groups.create({
                        name: groupName,
                        hidden: 1,
                    });
                }
                catch (err) {
                    // I cannot assign a type to err
                    // (Catch clause variable type annotation must be 'any' or 'unknown' if specified)
                    // The next line calls a function in a module that has not been updated to TS yet
                    // eslint-disable-next-line max-len
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                    if (err && err.message !== '[[error:group-already-exists]]') {
                        winston_1.default.error(`[groups.join] Could not create new hidden group (${groupName})\n${err.stack}`);
                        throw err;
                    }
                }
            }
        });
    }
    function setGroupTitleIfNotSet(groupNames, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const ignore = ['registered-users', 'verified-users', 'unverified-users', Groups.BANNED_USERS];
            groupNames = groupNames.filter(
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            groupName => !ignore.includes(groupName) && !Groups.isPrivilegeGroup(groupName));
            if (!groupNames.length) {
                return;
            }
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const currentTitle = yield database_1.default.getObjectField(`user:${uid}`, 'groupTitle');
            if (currentTitle || currentTitle === '') {
                return;
            }
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield user_1.default.setUserField(uid, 'groupTitle', JSON.stringify(groupNames));
        });
    }
    Groups.join = function (groupNames, uid) {
        return __awaiter(this, void 0, void 0, function* () {
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
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const [isMembers, exists, isAdmin] = yield Promise.all([
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                Groups.isMemberOfGroups(uid, groupNames),
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                Groups.exists(groupNames),
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                user_1.default.isAdministrator(uid),
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
            yield createNonExistingGroups(groupsToCreate);
            const promises = [
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                database_1.default.sortedSetsAdd(groupsToJoin.map(groupName => `group:${groupName}:members`), Date.now(), uid),
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                database_1.default.incrObjectField(groupsToJoin.map(groupName => `group:${groupName}`), 'memberCount'),
            ];
            if (isAdmin) {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                promises.push(database_1.default.setsAdd(groupsToJoin.map(groupName => `group:${groupName}:owners`), uid));
            }
            yield Promise.all(promises);
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            Groups.clearCache(uid, groupsToJoin);
            cache_1.default.del(groupsToJoin.map(name => `group:${name}:members`));
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const groupData = yield Groups.getGroupsFields(groupsToJoin, ['name', 'hidden', 'memberCount']);
            const visibleGroups = groupData.filter(groupData => groupData && !groupData.hidden);
            if (visibleGroups.length) {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                yield database_1.default.sortedSetAdd('groups:visible:memberCount', 
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                visibleGroups.map(groupData => groupData.memberCount), 
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                visibleGroups.map(groupData => groupData.name));
            }
            yield setGroupTitleIfNotSet(groupsToJoin, uid).catch();
            plugins_1.default.hooks.fire('action:group.join', {
                groupNames: groupsToJoin,
                uid: uid,
            });
        });
    };
};
