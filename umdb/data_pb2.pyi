from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class UMDatabase(_message.Message):
    __slots__ = ("version", "chara", "card", "support_card", "race_instance", "skill", "text_data", "single_mode_skill_need_point", "single_mode_rank")
    VERSION_FIELD_NUMBER: _ClassVar[int]
    CHARA_FIELD_NUMBER: _ClassVar[int]
    CARD_FIELD_NUMBER: _ClassVar[int]
    SUPPORT_CARD_FIELD_NUMBER: _ClassVar[int]
    RACE_INSTANCE_FIELD_NUMBER: _ClassVar[int]
    SKILL_FIELD_NUMBER: _ClassVar[int]
    TEXT_DATA_FIELD_NUMBER: _ClassVar[int]
    SINGLE_MODE_SKILL_NEED_POINT_FIELD_NUMBER: _ClassVar[int]
    SINGLE_MODE_RANK_FIELD_NUMBER: _ClassVar[int]
    version: str
    chara: _containers.RepeatedCompositeFieldContainer[Chara]
    card: _containers.RepeatedCompositeFieldContainer[Card]
    support_card: _containers.RepeatedCompositeFieldContainer[SupportCard]
    race_instance: _containers.RepeatedCompositeFieldContainer[RaceInstance]
    skill: _containers.RepeatedCompositeFieldContainer[Skill]
    text_data: _containers.RepeatedCompositeFieldContainer[TextData]
    single_mode_skill_need_point: _containers.RepeatedCompositeFieldContainer[SingleModeSkillNeedPoint]
    single_mode_rank: _containers.RepeatedCompositeFieldContainer[SingleModeRank]
    def __init__(self, version: _Optional[str] = ..., chara: _Optional[_Iterable[_Union[Chara, _Mapping]]] = ..., card: _Optional[_Iterable[_Union[Card, _Mapping]]] = ..., support_card: _Optional[_Iterable[_Union[SupportCard, _Mapping]]] = ..., race_instance: _Optional[_Iterable[_Union[RaceInstance, _Mapping]]] = ..., skill: _Optional[_Iterable[_Union[Skill, _Mapping]]] = ..., text_data: _Optional[_Iterable[_Union[TextData, _Mapping]]] = ..., single_mode_skill_need_point: _Optional[_Iterable[_Union[SingleModeSkillNeedPoint, _Mapping]]] = ..., single_mode_rank: _Optional[_Iterable[_Union[SingleModeRank, _Mapping]]] = ...) -> None: ...

class Chara(_message.Message):
    __slots__ = ("id", "name", "cast_name")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    CAST_NAME_FIELD_NUMBER: _ClassVar[int]
    id: int
    name: str
    cast_name: str
    def __init__(self, id: _Optional[int] = ..., name: _Optional[str] = ..., cast_name: _Optional[str] = ...) -> None: ...

class Card(_message.Message):
    __slots__ = ("id", "name")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    id: int
    name: str
    def __init__(self, id: _Optional[int] = ..., name: _Optional[str] = ...) -> None: ...

class SupportCard(_message.Message):
    __slots__ = ("id", "name", "chara_id")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    CHARA_ID_FIELD_NUMBER: _ClassVar[int]
    id: int
    name: str
    chara_id: int
    def __init__(self, id: _Optional[int] = ..., name: _Optional[str] = ..., chara_id: _Optional[int] = ...) -> None: ...

class RaceInstance(_message.Message):
    __slots__ = ("id", "name", "distance", "ground_type")
    class GroundType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        UNKNOWN_GROUND_TYPE: _ClassVar[RaceInstance.GroundType]
        TURF: _ClassVar[RaceInstance.GroundType]
        DIRT: _ClassVar[RaceInstance.GroundType]
    UNKNOWN_GROUND_TYPE: RaceInstance.GroundType
    TURF: RaceInstance.GroundType
    DIRT: RaceInstance.GroundType
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    DISTANCE_FIELD_NUMBER: _ClassVar[int]
    GROUND_TYPE_FIELD_NUMBER: _ClassVar[int]
    id: int
    name: str
    distance: int
    ground_type: RaceInstance.GroundType
    def __init__(self, id: _Optional[int] = ..., name: _Optional[str] = ..., distance: _Optional[int] = ..., ground_type: _Optional[_Union[RaceInstance.GroundType, str]] = ...) -> None: ...

class Skill(_message.Message):
    __slots__ = ("id", "name", "grade_value", "tag_id", "rarity")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    GRADE_VALUE_FIELD_NUMBER: _ClassVar[int]
    TAG_ID_FIELD_NUMBER: _ClassVar[int]
    RARITY_FIELD_NUMBER: _ClassVar[int]
    id: int
    name: str
    grade_value: int
    tag_id: _containers.RepeatedScalarFieldContainer[str]
    rarity: int
    def __init__(self, id: _Optional[int] = ..., name: _Optional[str] = ..., grade_value: _Optional[int] = ..., tag_id: _Optional[_Iterable[str]] = ..., rarity: _Optional[int] = ...) -> None: ...

class TextData(_message.Message):
    __slots__ = ("id", "category", "index", "text")
    ID_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_FIELD_NUMBER: _ClassVar[int]
    INDEX_FIELD_NUMBER: _ClassVar[int]
    TEXT_FIELD_NUMBER: _ClassVar[int]
    id: int
    category: int
    index: int
    text: str
    def __init__(self, id: _Optional[int] = ..., category: _Optional[int] = ..., index: _Optional[int] = ..., text: _Optional[str] = ...) -> None: ...

class SingleModeSkillNeedPoint(_message.Message):
    __slots__ = ("id", "need_skill_point", "status_type", "status_value", "solvable_type")
    ID_FIELD_NUMBER: _ClassVar[int]
    NEED_SKILL_POINT_FIELD_NUMBER: _ClassVar[int]
    STATUS_TYPE_FIELD_NUMBER: _ClassVar[int]
    STATUS_VALUE_FIELD_NUMBER: _ClassVar[int]
    SOLVABLE_TYPE_FIELD_NUMBER: _ClassVar[int]
    id: int
    need_skill_point: int
    status_type: int
    status_value: int
    solvable_type: int
    def __init__(self, id: _Optional[int] = ..., need_skill_point: _Optional[int] = ..., status_type: _Optional[int] = ..., status_value: _Optional[int] = ..., solvable_type: _Optional[int] = ...) -> None: ...

class SingleModeRank(_message.Message):
    __slots__ = ("id", "min_value", "max_value")
    ID_FIELD_NUMBER: _ClassVar[int]
    MIN_VALUE_FIELD_NUMBER: _ClassVar[int]
    MAX_VALUE_FIELD_NUMBER: _ClassVar[int]
    id: int
    min_value: int
    max_value: int
    def __init__(self, id: _Optional[int] = ..., min_value: _Optional[int] = ..., max_value: _Optional[int] = ...) -> None: ...
