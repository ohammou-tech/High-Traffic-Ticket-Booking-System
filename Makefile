rundev:
	docker compose -f compose.dev.yml  up --build  -d 
down:
	docker compose -f ./compose.dev.yml down -v

clean-images:
		@echo "$(YELLOW)Cleaning project images...$(RESET)"
		@images=$$(docker images -q); \
		if [ -n "$$images" ]; then \
				docker rmi $$images; \
				echo "$(GREEN)Images deleted.$(RESET)"; \
		else \
				echo "No images to delete."; \
		fi
		@echo "$(YELLOW)Cleaning dangling images...$(RESET)"
		@dangling=$$(docker images -q --filter "dangling=true"); \
		if [ -n "$$dangling" ]; then \
				docker rmi $$dangling; \
				echo "$(GREEN)Dangling images deleted.$(RESET)"; \
		fi