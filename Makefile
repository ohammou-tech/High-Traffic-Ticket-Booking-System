rundev:
	docker compose -f compose.dev.yml up -d --build

down:
	docker compose -f compose.dev.yml down -v

backendlogs:
	docker compose -f compose.dev.yml logs -f backend

workerlogs:
	docker compose -f compose.dev.yml logs -f worker

alllogs:
	docker compose -f compose.dev.yml logs -f backend worker postgres rabbitmq redis

clean-images:
	@echo "Cleaning project images..."
	@images=$$(docker images -q); \
	if [ -n "$$images" ]; then \
		docker rmi $$images; \
		echo "Images deleted."; \
	else \
		echo "No images to delete."; \
	fi
	@echo "Cleaning dangling images..."
	@dangling=$$(docker images -q --filter "dangling=true"); \
	if [ -n "$$dangling" ]; then \
		docker rmi $$dangling; \
		echo "Dangling images deleted."; \
	fi
