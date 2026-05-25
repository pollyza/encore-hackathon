## Hero — used for both player and AI-controlled enemy heroes.
##
## When `is_player == true`, reads WASD + mouse + QWER input.
## When `is_player == false`, runs simple AI: walk toward nearest enemy and
## auto-attack when in range.
##
## Health and mana are exposed; HUD reads them via the `stats_changed` signal.
class_name Hero
extends CharacterBody2D

signal stats_changed(hp: float, max_hp: float, mp: float, max_mp: float)
signal died(hero: Hero)

@export var is_player: bool = false
@export var max_hp: float = 100.0
@export var hp_regen: float = 1.0  ## per second
@export var max_mp: float = 100.0
@export var mp_regen: float = 8.0
@export var move_speed: float = 220.0
@export var attack_damage: float = 10.0
@export var attack_range: float = 90.0
@export var attack_interval: float = 0.7

## Abilities slotted Q / W / E / R. Assign Ability resources in the editor.
@export var ability_q: Ability
@export var ability_w: Ability
@export var ability_e: Ability
@export var ability_r: Ability

var hp: float
var mp: float
var _attack_cd: float = 0.0
var _facing: int = 1   ## 1 = right, -1 = left

func _ready() -> void:
    hp = max_hp
    mp = max_mp
    add_to_group("heroes")
    if is_player:
        add_to_group("player")
    else:
        add_to_group("enemies")
    emit_signal("stats_changed", hp, max_hp, mp, max_mp)

func _physics_process(delta: float) -> void:
    _tick_regen(delta)
    _tick_abilities(delta)
    if _attack_cd > 0.0:
        _attack_cd = max(0.0, _attack_cd - delta)

    if is_player:
        _handle_player_input(delta)
    else:
        _handle_ai(delta)

    move_and_slide()

func _tick_regen(delta: float) -> void:
    var prev_hp := hp
    var prev_mp := mp
    hp = min(max_hp, hp + hp_regen * delta)
    mp = min(max_mp, mp + mp_regen * delta)
    if abs(prev_hp - hp) > 0.5 or abs(prev_mp - mp) > 0.5:
        emit_signal("stats_changed", hp, max_hp, mp, max_mp)

func _tick_abilities(delta: float) -> void:
    if ability_q: ability_q.tick(delta)
    if ability_w: ability_w.tick(delta)
    if ability_e: ability_e.tick(delta)
    if ability_r: ability_r.tick(delta)

func _handle_player_input(_delta: float) -> void:
    var input_vec := Vector2(
        Input.get_action_strength("move_right") - Input.get_action_strength("move_left"),
        Input.get_action_strength("move_down") - Input.get_action_strength("move_up"),
    )
    velocity = input_vec.normalized() * move_speed
    if input_vec.x != 0.0:
        _facing = 1 if input_vec.x > 0.0 else -1

    var mouse_world: Vector2 = get_global_mouse_position()

    if Input.is_action_just_pressed("ability_q") and ability_q:
        ability_q.try_cast(self, mouse_world)
    if Input.is_action_just_pressed("ability_w") and ability_w:
        ability_w.try_cast(self, mouse_world)
    if Input.is_action_just_pressed("ability_e") and ability_e:
        ability_e.try_cast(self, mouse_world)
    if Input.is_action_just_pressed("ability_r") and ability_r:
        ability_r.try_cast(self, mouse_world)

func _handle_ai(_delta: float) -> void:
    var target := _nearest_player()
    if target == null:
        velocity = Vector2.ZERO
        return

    var to_target: Vector2 = target.global_position - global_position
    var dist: float = to_target.length()

    if dist <= attack_range:
        velocity = Vector2.ZERO
        if _attack_cd <= 0.0:
            _basic_attack(target)
    else:
        velocity = to_target.normalized() * move_speed
        if to_target.x != 0.0:
            _facing = 1 if to_target.x > 0.0 else -1

func _nearest_player() -> Node2D:
    var best: Node2D = null
    var best_d: float = INF
    for n in get_tree().get_nodes_in_group("player"):
        if n == self or not n is Node2D:
            continue
        var d: float = global_position.distance_squared_to((n as Node2D).global_position)
        if d < best_d:
            best_d = d
            best = n
    return best

func _basic_attack(target: Node2D) -> void:
    if target.has_method("take_damage"):
        target.take_damage(attack_damage, self)
    _attack_cd = attack_interval

func take_damage(amount: float, _source: Node2D) -> void:
    hp = max(0.0, hp - amount)
    emit_signal("stats_changed", hp, max_hp, mp, max_mp)
    if hp <= 0.0:
        emit_signal("died", self)
        queue_free()
