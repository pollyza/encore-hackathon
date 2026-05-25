## Game — top-level controller for an Encore MOBA round.
##
## Responsibilities:
##   - Track round timer (default 45s, mirroring HTML5 MOBA template)
##   - Detect win/loss and broadcast to UI
##   - Hold references to player / enemies / objectives for HUD lookups
##
## Attach this to the root Node of main.tscn. Drag the player + enemy hero
## nodes into the @export fields in the inspector.
class_name Game
extends Node

signal round_ended(won: bool, reason: String)
signal timer_tick(time_left: float)

@export var round_duration: float = 45.0
@export var player: Hero
@export var enemy_heroes: Array[Hero] = []

var _time_left: float
var _over: bool = false

func _ready() -> void:
    _time_left = round_duration
    if player:
        player.died.connect(_on_player_died)
    for h in enemy_heroes:
        if h:
            h.died.connect(_on_enemy_died)

func _process(delta: float) -> void:
    if _over:
        return
    _time_left = max(0.0, _time_left - delta)
    emit_signal("timer_tick", _time_left)
    if _time_left <= 0.0:
        _end(false, "Time up")

func _on_player_died(_h: Hero) -> void:
    _end(false, "You died")

func _on_enemy_died(h: Hero) -> void:
    enemy_heroes.erase(h)
    if enemy_heroes.is_empty():
        _end(true, "All enemies cleared")

func _end(won: bool, reason: String) -> void:
    if _over: return
    _over = true
    emit_signal("round_ended", won, reason)
