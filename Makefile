rundev:
	docker compose -f ./compose.dev.yml up
down:
	docker compose -f ./compose.dev.yml down -v
