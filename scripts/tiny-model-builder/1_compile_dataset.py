import json
import os

# EA-Instruct: Converts Enterprise Architecture rules into Conversation JSONL for LLM tuning.

DATASET_PATH = "ea_instruct_dataset.jsonl"
SYSTEM_PROMPT = "You are an Enterprise Architecture Edge Agent. Analyze inputs against established BIAN and TOGAF principles, score realistically, and output strict markdown or JSON as requested."

def generate_training_data():
    examples = [
        {
            "instruction": "Does the following diagram comply with the Scalability principle?",
            "input": "The API Gateway targets a monolithic database with no read-replicas.",
            "output": "No. The architecture provides a single point of failure and bottleneck at the database layer. Recommendation: Implement read-replicas (CQRS) and horizontal sharding to achieve Compliance."
        },
        {
            "instruction": "Assess the DDQ score for Security based on this vendor input:",
            "input": "Vendor states they use TLS 1.2 but store PII in plaintext.",
            "output": "Score: 0. While in-transit encryption (TLS 1.2) is adopted, storing PII in plaintext violates the 'Always encrypt data at rest' core EA principle."
        },
        {
            "instruction": "Determine the App Tier and STRIDE threats:",
            "input": "A customer-facing mobile banking application orchestrating payments.",
            "output": "App Tier: 1. Threats: Spoofing (impersonation), Tampering (modifying payload), Information Disclosure (MITM attacks). High risk."
        }
    ]
    
    with open(DATASET_PATH, 'w', encoding='utf-8') as f:
        for ex in examples:
            # Qwen / ShareGPT message format
            record = {
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"{ex['instruction']}\n\nContext: {ex['input']}"},
                    {"role": "assistant", "content": ex['output']}
                ]
            }
            f.write(json.dumps(record) + "\n")
            
    print(f"Dataset compiled to {DATASET_PATH} with {len(examples)} core instruction sets.")
    print("Next Step: Run 2_finetune_model.py to initiate LoRA tuning on Qwen.")

if __name__ == "__main__":
    generate_training_data()
