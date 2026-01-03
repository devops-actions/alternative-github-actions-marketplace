Feature: Upsert and retrieve Actions from Table Storage
  As a client of the Actions API
  I want to upsert actions and retrieve them
  So that I can validate data round-trips

  Background:
    Given a clean table storage
    And a sample action payload at index 0


  Scenario: Upsert 5 actions and verify all can be retrieved
    Given sample action payloads at indices 0, 1, 2, 3, 4
    When I upsert all actions
    Then the upsert response status for all should be 201
    And the table should contain 5 entities


  Scenario: Search actions by owner with no results
    Given sample action payloads at indices 0, 1, 2, 3, 4
    When I upsert all actions
    And I search for actions by owner "nobody"
    Then the search response should be empty



  Scenario: Search actions by owner with multiple results
    Given sample action payloads at indices 0, 1, 2, 3, 4
    When I upsert all actions
    And I search for actions by owner "Owner1"
    Then the search response should contain at least 2 actions with owner "Owner1"
    And I search for actions by owner "Owner2"
    Then the search response should contain exactly 1 action with owner "Owner2"
    And the Owner2 search result should not be present in the Owner1 search results


  Scenario: Upsert then Get an action
    When I upsert the action
    Then the upsert response status should be 201
    And the table entity should exist
    When I get the action by owner and name
    Then the get response status should be 200
    And the get response should include the action payload and metadata
