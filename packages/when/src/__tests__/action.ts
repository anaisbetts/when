import { Subject, throwError } from 'rxjs';

import { Action } from '../action';
import { createCollection } from '../custom-operators';

describe('the Action class', function() {
  it('should call the factory function', function() {
    let die = true;
    const fixture = Action.create(() => die = false, true);
    expect(die).toBeTruthy();

    fixture.execute();
    expect(die).toBeFalsy();
  });

  it('should signal a result', function() {
    let die = true;
    const fixture = Action.create(() => die = false, true);
    const result: boolean[] = createCollection(fixture.result);

    expect(result.length).toEqual(1);

    fixture.execute();
    expect(result.length).toEqual(2);
    expect(die).toEqual(false);
  });

  it('should pipe errors to thrownErrors', function() {
    const fixture = Action.createAsync(() => throwError(new Error('die')), true);
    const result: Error[] = createCollection(fixture.thrownErrors);

    let err = null;
    expect(result.length).toEqual(0);
    expect(err).toEqual(null);

    // tslint:disable-next-line:no-empty
    fixture.execute().subscribe(_ => {}, (e) => err = e);

    expect(err).toBeTruthy();
    expect(result.length).toEqual(1);
  });

  it('should report isExecuting correctly', function() {
    const input = new Subject<boolean>();
    const fixture = Action.createAsync<boolean>(() => input, true);
    const result1: boolean[] = createCollection(fixture.result);

    expect(fixture.isExecuting).toBeFalsy();
    expect(result1.length).toEqual(1);

    // Undo result being a BehaviorSubject
    result1.pop();

    const result2 = createCollection(fixture.execute());
    expect(result1).toEqual(result2);
    expect(result1.length).toEqual(0);
    expect(fixture.isExecuting).toBeTruthy();

    input.next(false);
    expect(result1).toEqual(result2);
    expect(result1.length).toEqual(1);
    expect(fixture.isExecuting).toBeTruthy();

    input.next(true);
    expect(result1).toEqual(result2);
    expect(result1.length).toEqual(2);
    expect(fixture.isExecuting).toBeTruthy();

    input.complete();
    expect(result1).toEqual(result2);
    expect(result1.length).toEqual(2);
    expect(fixture.isExecuting).toBeFalsy();
  });

  it('should dedupe calls to execute', function() {
    let callCount = 0;

    const input = new Subject<boolean>();
    const fixture = Action.createAsync<boolean>(() => { callCount++; return input; }, true);
    const result: boolean[] = createCollection(fixture.result);

    expect(fixture.isExecuting).toBeFalsy();
    expect(result.length).toEqual(1);
    expect(callCount).toEqual(0);

    fixture.execute();
    expect(callCount).toEqual(1);

    fixture.execute();
    expect(callCount).toEqual(1);

    input.complete();
    expect(callCount).toEqual(1);

    fixture.execute();
    expect(callCount).toEqual(2);
  });
});
