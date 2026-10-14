import assert from 'node:assert/strict';
import test from 'node:test';
import { create } from '@bufbuild/protobuf';
import { SkillSchema, SkillConditionGroupSchema } from './data_pb';
import UMDatabaseWrapper from './UMDatabaseWrapper';
import { calculateRankScore, fromRaceHorseData } from './TrainedCharaData';

test('Icarus rating rounds half-points exactly and leaves surface/inherited skills unscaled', () => {
    const previous = UMDatabaseWrapper.skills;
    const skill = (id: number, gradeValue: number, condition: string) => create(SkillSchema, {
        id, gradeValue, conditionGroups: [create(SkillConditionGroupSchema, { condition })],
    });
    UMDatabaseWrapper.skills = {
        201502: skill(201502, 85, 'running_style==4'),
        900131: skill(900131, 180, 'distance_type==4'),
        200001: skill(200001, 100, 'ground_type==1'),
        200002: skill(200002, 85, 'distance_type==4&running_style==4'),
    };
    try {
        const learned = [201502, 900131, 200001, 200002].map(skillId => ({ skillId, level: 1 }));
        // 60 + 180 + 100 + round(85 * 0.9 * 0.7) = 394.
        assert.equal(calculateRankScore([0, 0, 0, 0, 0], learned, { 4: 5 }, { 4: 1 }), 394);
        assert.equal(calculateRankScore([1200, 1200, 1200, 1200, 1200], [], {}, {}), 19205);
        assert.equal(calculateRankScore([0], [{ skillId: 100131, level: 6 }], {}, {}), 1020);
        assert.equal(calculateRankScore([0], [{ skillId: 10031, level: 6 }], {}, {}, 2), 720);
        const horse = { speed: 0, stamina: 0, power: 0, guts: 0, wiz: 0,
            skill_array: [{ skill_id: 201502, level: 1 }], apt_style: 1 };
        assert.equal(fromRaceHorseData(horse).rankScore, 60);
        assert.equal(fromRaceHorseData({ ...horse, rank_score: 999 }).rankScore, 999);
        assert.equal(fromRaceHorseData({ ...horse, rank_score: 0 }).rankScore, 60);
    } finally {
        UMDatabaseWrapper.skills = previous;
    }
});
