## HUD — top-of-screen HP/MP/timer + bottom skill bar + center end-card.
##
## Wires up to the Game signal `round_ended` and the player's `stats_changed`.
## Attach this to the HUD CanvasLayer / Control node in main.tscn.
extends CanvasLayer

@export var game: Game
@export var player: Hero

@onready var _hp_bar: ProgressBar = $TopBar/HPBar
@onready var _mp_bar: ProgressBar = $TopBar/MPBar
@onready var _timer_label: Label = $TopBar/Timer
@onready var _q_cd: ProgressBar = $SkillBar/Q/CD
@onready var _w_cd: ProgressBar = $SkillBar/W/CD
@onready var _e_cd: ProgressBar = $SkillBar/E/CD
@onready var _r_cd: ProgressBar = $SkillBar/R/CD
@onready var _end_card: Panel = $EndCard
@onready var _end_title: Label = $EndCard/Title
@onready var _end_sub: Label = $EndCard/Subtitle

func _ready() -> void:
    if game:
        game.timer_tick.connect(_on_timer_tick)
        game.round_ended.connect(_on_round_ended)
    if player:
        player.stats_changed.connect(_on_player_stats_changed)
        _on_player_stats_changed(player.hp, player.max_hp, player.mp, player.max_mp)
    if _end_card:
        _end_card.visible = false

func _process(_delta: float) -> void:
    # Skill cooldown bars update every frame (cheap)
    if player == null:
        return
    if player.ability_q and _q_cd: _q_cd.value = 1.0 - player.ability_q.cooldown_ratio()
    if player.ability_w and _w_cd: _w_cd.value = 1.0 - player.ability_w.cooldown_ratio()
    if player.ability_e and _e_cd: _e_cd.value = 1.0 - player.ability_e.cooldown_ratio()
    if player.ability_r and _r_cd: _r_cd.value = 1.0 - player.ability_r.cooldown_ratio()

func _on_timer_tick(time_left: float) -> void:
    if _timer_label:
        _timer_label.text = "0:%02d" % ceil(time_left)

func _on_player_stats_changed(hp: float, max_hp: float, mp: float, max_mp: float) -> void:
    if _hp_bar:
        _hp_bar.max_value = max_hp
        _hp_bar.value = hp
    if _mp_bar:
        _mp_bar.max_value = max_mp
        _mp_bar.value = mp

func _on_round_ended(won: bool, reason: String) -> void:
    if _end_card == null:
        return
    _end_card.visible = true
    _end_title.text = "VICTORY" if won else "DEFEAT"
    _end_sub.text = reason
