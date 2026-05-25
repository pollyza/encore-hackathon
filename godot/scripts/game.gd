## Game — top-level controller for an Encore MOBA round.
##
## Responsibilities:
##   - Auto-wire to sibling Arena + HUD nodes after they've spawned content
##   - Track round timer (default 45s, mirroring HTML5 MOBA template)
##   - Detect win/loss and broadcast to UI
##   - Hold the list of enemy heroes for HUD kill-count display
##
## Attach this to the root Node of main.tscn. The Arena + HUD nodes are
## found by name as siblings — no inspector wiring needed.
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
	# Wire after frame settles so Arena.spawn_heroes() has finished
	call_deferred("_auto_wire")

func _auto_wire() -> void:
	var arena: Node = get_node_or_null("Arena")
	var hud: Node = get_node_or_null("HUD")

	# Pull player + enemies from Arena
	if arena and arena.has_method("get_player"):
		player = arena.get_player()
	if arena:
		var heroes_node: Node = arena.get_node_or_null("Heroes")
		if heroes_node:
			enemy_heroes.clear()
			for child in heroes_node.get_children():
				if child is Hero and child != player:
					enemy_heroes.append(child)

	# Subscribe to lifecycle signals
	if player:
		player.died.connect(_on_player_died)
	for h in enemy_heroes:
		if h:
			h.died.connect(_on_enemy_died)

	# Push refs to HUD so its signal subscriptions can land
	if hud and hud.has_method("wire"):
		hud.wire(self, player)

	# Emit initial timer tick so HUD shows full duration immediately
	emit_signal("timer_tick", _time_left)

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
