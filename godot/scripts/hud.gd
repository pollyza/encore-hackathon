## HUD — wires Game + Player signals to on-screen Control nodes.
##
## Layout (defined in scenes/hud.tscn):
##   TopBar
##     ├─ HPBar    (with overlay HPLabel)
##     ├─ MPBar    (with overlay MPLabel)
##     ├─ Timer    (gold, center, big)
##     └─ KillCounter  (right-aligned)
##   SkillBar
##     ├─ Q / W / E / R panels
##         ├─ Letter (cyan when ready, gray when no ability)
##         └─ CD     (dark overlay fills bottom-up while on cooldown)
##   EndCard (hidden until Game emits round_ended)
##     ├─ Title    (VICTORY / DEFEAT)
##     └─ Subtitle (reason)
##
## Wired at runtime by main.tscn — set `game` + `player` via inspector.
extends CanvasLayer

@export var game: Game
@export var player: Hero

# Pre-resolved @onready node refs — null-safe via @onready (created in _ready)
@onready var _hp_bar: ProgressBar = $TopBar/HPBar
@onready var _hp_label: Label = $TopBar/HPBar/HPLabel
@onready var _mp_bar: ProgressBar = $TopBar/MPBar
@onready var _mp_label: Label = $TopBar/MPBar/MPLabel
@onready var _timer_label: Label = $TopBar/Timer
@onready var _kill_label: Label = $TopBar/KillCounter
@onready var _q_cd: ProgressBar = $SkillBar/Q/CD
@onready var _w_cd: ProgressBar = $SkillBar/W/CD
@onready var _e_cd: ProgressBar = $SkillBar/E/CD
@onready var _r_cd: ProgressBar = $SkillBar/R/CD
@onready var _q_letter: Label = $SkillBar/Q/Letter
@onready var _w_letter: Label = $SkillBar/W/Letter
@onready var _e_letter: Label = $SkillBar/E/Letter
@onready var _r_letter: Label = $SkillBar/R/Letter
@onready var _end_card: Panel = $EndCard
@onready var _end_title: Label = $EndCard/Title
@onready var _end_sub: Label = $EndCard/Subtitle

const CD_READY_COLOR := Color(0.4, 1.0, 0.85, 1.0)
const CD_NONE_COLOR := Color(0.5, 0.5, 0.55, 1.0)

var _initial_enemy_count: int = 0

func _ready() -> void:
	# HUD is typically instanced before game.gd wires it. _ready() just sets
	# the visible-by-default state; signal subscriptions happen in wire().
	_end_card.visible = false

## Called by game.gd._auto_wire() after Arena has spawned heroes. Sets the
## game + player refs and connects all the relevant signals.
func wire(g: Game, p: Hero) -> void:
	game = g
	player = p

	if game:
		game.timer_tick.connect(_on_timer_tick)
		game.round_ended.connect(_on_round_ended)
		_initial_enemy_count = game.enemy_heroes.size()

	if player:
		player.stats_changed.connect(_on_player_stats_changed)
		_on_player_stats_changed(player.hp, player.max_hp, player.mp, player.max_mp)
		_q_letter.modulate = CD_READY_COLOR if player.ability_q else CD_NONE_COLOR
		_w_letter.modulate = CD_READY_COLOR if player.ability_w else CD_NONE_COLOR
		_e_letter.modulate = CD_READY_COLOR if player.ability_e else CD_NONE_COLOR
		_r_letter.modulate = CD_READY_COLOR if player.ability_r else CD_NONE_COLOR

	_update_kill_label()

func _process(_delta: float) -> void:
	# Skill cooldown bars: value 0.0 = ready (no overlay), 1.0 = just cast
	if player == null:
		return
	_set_cd(_q_cd, player.ability_q)
	_set_cd(_w_cd, player.ability_w)
	_set_cd(_e_cd, player.ability_e)
	_set_cd(_r_cd, player.ability_r)
	_update_kill_label()

func _set_cd(bar: ProgressBar, ability: Ability) -> void:
	if ability == null:
		bar.value = 1.0  # full dark overlay = "no ability"
		return
	bar.value = ability.cooldown_ratio()  # 0 ready, 1 just cast

func _on_timer_tick(time_left: float) -> void:
	_timer_label.text = "0:%02d" % int(ceil(time_left))
	# Warm to hot color as time runs out (gold > orange > red under 10s)
	if time_left < 10.0:
		_timer_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	elif time_left < 20.0:
		_timer_label.add_theme_color_override("font_color", Color(1.0, 0.6, 0.25))
	else:
		_timer_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.35))

func _on_player_stats_changed(hp: float, max_hp: float, mp: float, max_mp: float) -> void:
	_hp_bar.max_value = max_hp
	_hp_bar.value = hp
	_hp_label.text = "HP %d / %d" % [int(round(hp)), int(round(max_hp))]
	_mp_bar.max_value = max_mp
	_mp_bar.value = mp
	_mp_label.text = "MP %d / %d" % [int(round(mp)), int(round(max_mp))]

func _update_kill_label() -> void:
	if game == null:
		return
	var alive: int = game.enemy_heroes.size()
	var killed: int = max(0, _initial_enemy_count - alive)
	_kill_label.text = "KILLS  %d / %d" % [killed, _initial_enemy_count]

func _on_round_ended(won: bool, reason: String) -> void:
	_end_card.visible = true
	if won:
		_end_title.text = "VICTORY"
		_end_title.add_theme_color_override("font_color", Color(0.4, 1.0, 0.85))
	else:
		_end_title.text = "DEFEAT"
		_end_title.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	_end_sub.text = reason
