import sys
import os
import json
import time

# Mock env
sys.path.append(os.getcwd())

try:
    from hotnews.kernel.ai.manager import AIModelManager
except ImportError:
    print("Could not import AIModelManager. Ensure you are in project root.")
    sys.exit(1)

def test_manager_logic():
    print(">>> Testing AIModelManager Logic...")
    mgr = AIModelManager.get_instance()
    mgr.set_project_root(os.getcwd())
    
    # 1. Setup Mock Providers
    providers = [
        {"id": "p1", "name": "Provider 1", "api_key": "sk-123", "enabled": True},
        {"id": "p2", "name": "Provider 2", "api_key": "sk-456", "enabled": True}
    ]
    mgr.save_providers(providers)
    
    # 2. Setup Mock Models
    # Model A: Priority 10 (Highest)
    # Model B: Priority 50 
    # Model C: Expired
    # Model D: Disabled
    
    now_str = "2099-12-31" # Future
    expired_str = "2020-01-01" # Past
    
    models = [
        {"id": "m1", "name": "Model A", "provider_id": "p1", "priority": 10, "expires": now_str, "enabled": True},
        {"id": "m2", "name": "Model B", "provider_id": "p2", "priority": 50, "expires": "", "enabled": True},
        {"id": "m3", "name": "Model C", "provider_id": "p1", "priority": 5, "expires": expired_str, "enabled": True},
        {"id": "m4", "name": "Model D", "provider_id": "p1", "priority": 1, "expires": "", "enabled": False},
    ]
    mgr.save_models(models)
    
    # 3. Test Rotation List
    candidates = mgr.get_active_rotation_list()
    print(f"Candidates found: {len(candidates)}")
    
    # Expectation: m1 (p10), m2 (p50). m3 expired, m4 disabled.
    # Order: m1 then m2
    
    if len(candidates) != 2:
        print(f"❌ FAIL: Expected 2 candidates, got {len(candidates)}")
        for c in candidates: print(c)
        return
        
    if candidates[0]['id'] != 'm1':
        print(f"❌ FAIL: Expected m1 first (p10), got {candidates[0]['id']} (p{candidates[0]['priority']})")
        return
        
    if candidates[1]['id'] != 'm2':
        print(f"❌ FAIL: Expected m2 second, got {candidates[1]['id']}")
        return
        
    print("✅ Logic Check Passed: Priority Sort & Expiration Filter work correctly.")
    
    # 4. Cleanup (Optional, just to show it worked)
    print("Test Complete.")

if __name__ == "__main__":
    test_manager_logic()
